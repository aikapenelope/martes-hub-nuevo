'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Download, FileUp, Plus, Save, Trash2, TriangleAlert } from 'lucide-react'
import { WhiteboardCanvas, type WhiteboardSceneData } from './WhiteboardCanvas'
import {
  createWhiteboardAction,
  deleteWhiteboardAction,
  importWhiteboardAction,
  loadWhiteboardSceneAction,
  saveWhiteboardAction,
  type WhiteboardScene,
  type WhiteboardSummary,
} from '@/lib/whiteboard-actions'

const AUTOSAVE_MS = 2000
const SAVE_RETRY_MS = 5000
const MAX_SAVE_RETRIES = 5
// Umbral de complejidad para regenerar la miniatura en cada autosave
// (pizarras gigantes: exportar PNG en cada trazo cuesta CPU).
const THUMBNAIL_MAX_ELEMENTS = 500

/* eslint-disable @typescript-eslint/no-explicit-any */
type ExcalidrawImperativeAPI = any
/* eslint-enable @typescript-eslint/no-explicit-any */

interface WhiteboardWorkspaceProps {
  tenantId: string
  tenantName: string
  isAdmin: boolean
  canEdit: boolean
  initialBoards: WhiteboardSummary[]
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'America/Caracas',
  }).format(date)
}

function boardLabel(board: WhiteboardSummary): string {
  return board.source === 'import' ? `${board.title} (importada)` : board.title
}

/** Respaldo local por pizarra para sobrevivir cierres/recargas durante el debounce. */
function backupKey(tenantId: string, boardId: number): string {
  return `martes-wb-bak-${tenantId}-${boardId}`
}

export function WhiteboardWorkspace({ tenantId, tenantName, isAdmin, canEdit, initialBoards }: WhiteboardWorkspaceProps) {
  const [boards, setBoards] = useState<WhiteboardSummary[]>(initialBoards)
  const [activeId, setActiveId] = useState<number | null>(null)
  // La escena siempre sabe de qué pizarra es: el canvas solo se monta cuando
  // coincide con la pizarra activa — nunca un editable en blanco.
  const [scene, setScene] = useState<WhiteboardSceneData | null>(null)
  const [sceneBoardId, setSceneBoardId] = useState<number | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const pendingSceneRef = useRef<{ id: number; scene: WhiteboardScene } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryCountRef = useRef(0)
  const savingRef = useRef(false)
  const activeIdRef = useRef<number | null>(null)
  const sceneBoardIdRef = useRef<number | null>(null)
  const boardsRef = useRef<WhiteboardSummary[]>(initialBoards)
  useEffect(() => {
    activeIdRef.current = activeId
    sceneBoardIdRef.current = sceneBoardId
  }, [activeId, sceneBoardId])
  useEffect(() => {
    boardsRef.current = boards
  }, [boards])

  const flushSaveRef = useRef<(() => Promise<void>) | null>(null)

  /** Reintento del autosave fallido (la escena pendiente se conserva). */
  const scheduleSaveRetry = useCallback(() => {
    if (retryCountRef.current >= MAX_SAVE_RETRIES) return
    retryCountRef.current += 1
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
    retryTimerRef.current = setTimeout(() => {
      void flushSaveRef.current?.()
    }, SAVE_RETRY_MS)
  }, [])

  /** Miniatura best-effort para la lista (nunca bloquea el guardado). */
  const generateThumbnail = useCallback(async (): Promise<string | null> => {
    const api = apiRef.current
    if (!api) return null
    try {
      if (api.getSceneElements().length > THUMBNAIL_MAX_ELEMENTS) return null
      const { exportToBlob } = await import('@excalidraw/excalidraw')
      const blob = await exportToBlob({
        elements: api.getSceneElements(),
        appState: { ...api.getAppState(), exportWithBackground: true },
        files: api.getFiles(),
        mimeType: 'image/png',
      })
      const bitmap = await createImageBitmap(blob)
      const scale = Math.min(1, 400 / bitmap.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/jpeg', 0.6)
    } catch {
      return null
    }
  }, [])

  const flushSave = useCallback(async () => {
    // Guard exclusivo: mientras hay un save en vuelo, la escena pendiente se
    // conserva y el siguiente debounce/retry la guarda completa.
    if (savingRef.current) return
    const pending = pendingSceneRef.current
    if (!pending) return
    savingRef.current = true
    setSaveError(null)
    try {
      // Respaldo local ANTES de intentar persistir: si el server falla o el
      // usuario cierra a mitad, el trabajo vive en el navegador.
      try {
        localStorage.setItem(backupKey(tenantId, pending.id), JSON.stringify({ ts: Date.now(), scene: pending.scene }))
      } catch {
        // storage lleno o bloqueado: el guardado normal sigue igual
      }
      // La miniatura solo se regenera si la pizarra sigue en pantalla; si el
      // usuario ya cambió de pizarra, el canvas actual sería de otra escena.
      const thumbnail = pending.id === activeIdRef.current ? await generateThumbnail() : null
      const result = await saveWhiteboardAction(pending.id, pending.scene, thumbnail === null ? undefined : thumbnail)
      if (result.ok) {
        retryCountRef.current = 0
        try {
          localStorage.removeItem(backupKey(tenantId, pending.id))
        } catch {
          // nada: el servidor ya tiene la escena
        }
        // Limpiar solo si el usuario no generó datos más nuevos mientras tanto
        if (pendingSceneRef.current === pending) pendingSceneRef.current = null
        setSavedAt(formatTime(new Date()))
        setBoards((prev) => prev.map((b) => (b.id === pending.id ? { ...b, updatedAt: new Date().toISOString() } : b)))
      } else {
        setSaveError(result.error)
        scheduleSaveRetry()
      }
    } catch (err) {
      // La escena pendiente SE CONSERVA: reintentar automáticamente y no
      // perder el trabajo si el usuario cierra la pestaña.
      setSaveError(err instanceof Error ? err.message : 'Error guardando la pizarra')
      scheduleSaveRetry()
    } finally {
      savingRef.current = false
    }
  }, [generateThumbnail, scheduleSaveRetry, tenantId])

  useEffect(() => {
    flushSaveRef.current = flushSave
  }, [flushSave])

  /** Abre una pizarra: guarda lo pendiente de la actual y carga su escena. */
  const openBoard = useCallback(
    (id: number) => {
      if (activeIdRef.current === id && sceneBoardIdRef.current === id) return

      // Flush inmediato de la pizarra actual (con su propio id) antes de salir —
      // cambiar dentro de la ventana de debounce no puede perder sus ediciones.
      if (pendingSceneRef.current && pendingSceneRef.current.id !== id) {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current)
          debounceRef.current = null
        }
        void flushSaveRef.current?.()
      }

      setActiveId(id)
      setScene(null)
      setSceneBoardId(null)
      setSavedAt(null)
      setSaveError(null)
      startTransition(async () => {
        try {
          const result = await loadWhiteboardSceneAction(id)
          // Carga vieja (selecciones rápidas): ignorar si ya no es la activa
          if (activeIdRef.current !== id) return
          if (!result.ok) {
            // Sin escena el canvas no se monta — nunca un editable en blanco
            setNotice(result.error)
            return
          }

          // Respaldo local más nuevo que el servidor (cierre durante un
          // autosave): restaurar y re-guardar en cuanto suba.
          try {
            const raw = localStorage.getItem(backupKey(tenantId, id))
            if (raw) {
              const backup = JSON.parse(raw) as { ts: number; scene: WhiteboardScene }
              const serverTs = (() => {
                const updatedAt = boardsRef.current.find((b) => b.id === id)?.updatedAt
                return updatedAt ? Date.parse(updatedAt) : 0
              })()
              const restore =
                backup &&
                Array.isArray(backup.scene?.elements) &&
                typeof backup.ts === 'number' &&
                backup.ts > serverTs
              localStorage.removeItem(backupKey(tenantId, id))
              if (restore) {
                setScene({
                  elements: backup.scene.elements,
                  files: backup.scene.files ?? {},
                  appState: backup.scene.appState ?? {},
                })
                setSceneBoardId(id)
                pendingSceneRef.current = { id, scene: backup.scene }
                debounceRef.current = setTimeout(() => {
                  void flushSaveRef.current?.()
                }, 500)
                setNotice('Se restauraron cambios locales sin guardar')
                return
              }
            }
          } catch {
            // respaldo corrupto: se ignora y se usa la escena del servidor
          }

          setScene({ elements: result.scene.elements, appState: result.scene.appState, files: result.scene.files })
          setSceneBoardId(id)
        } catch (err) {
          if (activeIdRef.current === id) {
            setNotice(err instanceof Error ? err.message : 'Error cargando la pizarra')
          }
        }
      })
    },
    [tenantId],
  )

  // Protección al salir: respaldo local + aviso del navegador mientras haya
  // ediciones pendientes (el debounce de 2s no termina de forma fiable en un
  // unload real). Navegación SPA: flush best-effort al desmontar.
  useEffect(() => {
    function persistPendingBackup(): boolean {
      const pending = pendingSceneRef.current
      if (!pending) return false
      try {
        localStorage.setItem(backupKey(tenantId, pending.id), JSON.stringify({ ts: Date.now(), scene: pending.scene }))
      } catch {
        // storage lleno o bloqueado: queda solo el aviso
      }
      return true
    }
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (persistPendingBackup()) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (pendingSceneRef.current) void flushSaveRef.current?.()
    }
  }, [tenantId])

  // Arranque. Con pizarras existentes se abre la más reciente (cualquier rol).
  // Migración legacy INDEPENDIENTE: cada navegador tiene su propio whiteboard
  // pre-Fase-2 y lo migra una sola vez (idempotente por marcador), aunque el
  // tenant ya tenga pizarras compartidas — sin crear pizarra vacía de más.
  useEffect(() => {
    let cancelled = false
    const storageKey = `martes-wb-${tenantId}`
    const migratedKey = `martes-wb-mig-${tenantId}`

    startTransition(async () => {
      if (initialBoards.length > 0) openBoard(initialBoards[0].id)

      let sceneToMigrate: WhiteboardScene | null = null
      try {
        if (canEdit && !localStorage.getItem(migratedKey)) {
          const raw = localStorage.getItem(storageKey)
          if (raw) {
            const parsed = JSON.parse(raw) as { elements?: unknown[]; files?: Record<string, unknown> }
            if (Array.isArray(parsed.elements) && parsed.elements.length > 0) {
              sceneToMigrate = { elements: parsed.elements, files: parsed.files ?? {} }
            }
          }
        }
      } catch {
        // localStorage corrupto o bloqueado: sin migración
      }

      if (sceneToMigrate) {
        try {
          localStorage.setItem(migratedKey, '1')
          const created = await createWhiteboardAction('Whiteboard (migrado de este navegador)')
          if (created.ok && !cancelled) {
            const saved = await saveWhiteboardAction(created.id, sceneToMigrate)
            if (saved.ok) {
              try {
                localStorage.removeItem(storageKey)
              } catch {
                // storage bloqueado: la pizarra ya vive en el server
              }
              setBoards((prev) =>
                prev.some((b) => b.id === created.id)
                  ? prev
                  : [{ id: created.id, title: created.title, thumbnail: null, source: 'import', updatedAt: new Date().toISOString() }, ...prev],
              )
              setNotice('Tu whiteboard local se migró como pizarra compartida')
              // Solo se abre automáticamente si el tenant no tenía pizarras
              if (initialBoards.length === 0 && activeIdRef.current == null) {
                setActiveId(created.id)
                setSceneBoardId(created.id)
                setScene({ elements: sceneToMigrate.elements, files: sceneToMigrate.files ?? {}, appState: {} })
              }
              return
            }
          }
          // Fallo: permitir reintento en el próximo arranque
          try {
            localStorage.removeItem(migratedKey)
          } catch {}
          if (!cancelled) setNotice(created.ok ? 'Error guardando el whiteboard migrado' : created.error)
        } catch (err) {
          try {
            localStorage.removeItem(migratedKey)
          } catch {}
          if (!cancelled) setNotice(err instanceof Error ? err.message : 'Error migrando el whiteboard local')
        }
        return // había contenido local: no crear pizarra vacía de más
      }

      // Tenant sin pizarras y sin contenido local: pizarra inicial
      if (initialBoards.length === 0 && canEdit) {
        try {
          const created = await createWhiteboardAction('Pizarra principal')
          if (created.ok && !cancelled) {
            setBoards([{ id: created.id, title: created.title, thumbnail: null, source: 'local', updatedAt: new Date().toISOString() }])
            setActiveId(created.id)
            setSceneBoardId(created.id)
            setScene({ elements: [], files: {}, appState: {} })
          } else if (created && !created.ok && !cancelled) {
            setNotice(created.error)
          }
        } catch (err) {
          if (!cancelled) setNotice(err instanceof Error ? err.message : 'Error creando la primera pizarra')
        }
      }
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSceneChange = useCallback(
    (elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
      const currentId = activeIdRef.current
      if (currentId == null) return
      retryCountRef.current = 0
      pendingSceneRef.current = {
        id: currentId,
        scene: {
          elements: elements as unknown[],
          files,
          // Solo viewport — el resto del appState es estado efímero del editor
          appState: {
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
            zoom: appState.zoom,
          },
        },
      }
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        void flushSaveRef.current?.()
      }, AUTOSAVE_MS)
    },
    [],
  )

  function handleCreate() {
    const title = prompt('Nombre de la nueva pizarra:')
    if (title === null) return
    startTransition(async () => {
      try {
        const result = await createWhiteboardAction(title || 'Sin título')
        if (result.ok) {
          setBoards((prev) => [{ id: result.id, title: result.title, thumbnail: null, source: 'local', updatedAt: new Date().toISOString() }, ...prev])
          openBoard(result.id)
        } else {
          setNotice(result.error)
        }
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Error creando la pizarra')
      }
    })
  }

  function handleDelete() {
    const id = activeId
    if (id == null) return
    if (!confirm('¿Borrar esta pizarra? Esta acción no se puede deshacer.')) return
    // Nada pendiente ni respaldo de una pizarra que se va a borrar
    if (pendingSceneRef.current?.id === id) pendingSceneRef.current = null
    try {
      localStorage.removeItem(backupKey(tenantId, id))
    } catch {}
    startTransition(async () => {
      try {
        const result = await deleteWhiteboardAction(id)
        if (result.ok) {
          const remaining = boards.filter((b) => b.id !== id)
          setBoards(remaining)
          if (activeId === id) {
            if (remaining[0]) openBoard(remaining[0].id)
            else {
              setActiveId(null)
              setScene(null)
              setSceneBoardId(null)
            }
          }
        } else {
          setNotice(result.error)
        }
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Error borrando la pizarra')
      }
    })
  }

  function handleImportFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const title = file.name.replace(/\.(excalidraw|json)$/i, '').slice(0, 120) || 'Pizarra importada'
    startTransition(async () => {
      try {
        const raw = await file.text()
        const result = await importWhiteboardAction(title, raw)
        if (result.ok) {
          setBoards((prev) => [{ id: result.id, title: result.title, thumbnail: null, source: 'import', updatedAt: new Date().toISOString() }, ...prev])
          openBoard(result.id)
        } else {
          setNotice(result.error)
        }
      } catch (err) {
        setNotice(err instanceof Error ? err.message : 'Error importando el archivo')
      }
    })
  }

  function handleExportFile() {
    const api = apiRef.current
    if (!api || activeId == null) return
    const title = boards.find((b) => b.id === activeId)?.title ?? 'whiteboard'
    const data = {
      type: 'excalidraw',
      version: 2,
      source: 'martes-hub',
      elements: api.getSceneElements(),
      appState: { viewBackgroundColor: api.getAppState().viewBackgroundColor ?? '#ffffff' },
      files: api.getFiles(),
    }
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^\w\-áéíóúñÁÉÍÓÚÑ ]+/g, '')}.excalidraw`
    a.click()
    URL.revokeObjectURL(url)
  }

  const activeBoard = boards.find((b) => b.id === activeId) ?? null
  const sceneReady = scene !== null && sceneBoardId === activeId

  return (
    <div className="relative flex h-full flex-col bg-zinc-950">
      {/* Toolbar: pizarras + acciones */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-black px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
          <span className="shrink-0 text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            Whiteboards · {tenantName}
          </span>
          <select
            value={activeId ?? ''}
            onChange={(e) => openBoard(Number(e.target.value))}
            disabled={boards.length === 0}
            aria-label="Seleccionar pizarra"
            className="min-w-0 max-w-[280px] truncate border border-zinc-800 bg-black px-2 py-1 text-[11px] font-mono text-white focus:border-zinc-500 focus:outline-none"
          >
            {boards.length === 0 && <option value="">Sin pizarras</option>}
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {boardLabel(b)}
              </option>
            ))}
          </select>
          <span className="hidden text-[10px] font-mono text-zinc-600 sm:block">{boards.length}/500</span>
        </div>

        <div className="flex items-center gap-2">
          {saveError ? (
            <span className="flex max-w-md items-center gap-1.5 border border-red-900 bg-red-950/60 px-2.5 py-1 text-[10px] font-mono text-red-300" role="alert">
              <TriangleAlert size={11} className="shrink-0" />
              {saveError}
            </span>
          ) : (
            savedAt && (
              <span className="hidden text-[10px] font-mono text-zinc-600 sm:block">
                <Save size={10} className="mr-1 inline" />
                Guardado {savedAt}
              </span>
            )
          )}
          {canEdit && (
            <label className="flex cursor-pointer items-center gap-1.5 border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-mono text-zinc-400 transition hover:border-zinc-500 hover:text-white">
              <FileUp size={11} /> Importar
              <input type="file" accept=".excalidraw,.json,application/json" onChange={handleImportFile} className="hidden" />
            </label>
          )}
          <button
            type="button"
            onClick={handleExportFile}
            disabled={!activeBoard}
            className="flex items-center gap-1.5 border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-mono text-zinc-400 transition hover:border-zinc-500 hover:text-white disabled:opacity-40"
          >
            <Download size={11} /> Exportar
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={!activeBoard}
              className="flex items-center gap-1.5 border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-mono text-zinc-600 transition hover:border-red-900 hover:text-red-400 disabled:opacity-40"
            >
              <Trash2 size={11} /> Borrar
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={isPending}
              className="flex items-center gap-1.5 border border-zinc-600 bg-white px-2.5 py-1 text-[11px] font-mono font-bold text-black transition hover:bg-zinc-200 disabled:opacity-50"
            >
              <Plus size={11} /> Nueva
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-900/60 bg-amber-950/40 px-4 py-1.5">
          <span className="text-[10px] font-mono text-amber-300">{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-[10px] font-mono text-amber-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Canvas: solo se monta con la escena ya cargada de SU pizarra */}
      {boards.length === 0 ? (
        <div className="flex flex-1 items-center justify-center bg-zinc-950">
          <span className="max-w-sm text-center text-xs font-mono text-zinc-500">
            Sin pizarras todavía. {canEdit ? 'Crea la primera con «Nueva» o importa un archivo .excalidraw.' : 'Pide a un agente que cree la primera.'}
          </span>
        </div>
      ) : sceneReady ? (
        <WhiteboardCanvas
          key={activeId ?? 'empty'}
          initialScene={scene}
          viewModeEnabled={!canEdit}
          onSceneChange={canEdit ? handleSceneChange : () => {}}
          onReady={(api) => {
            apiRef.current = api
          }}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center bg-zinc-950">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin border-2 border-zinc-700 border-t-white rounded-full" />
            <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Cargando pizarra…</span>
          </div>
        </div>
      )}
    </div>
  )
}
