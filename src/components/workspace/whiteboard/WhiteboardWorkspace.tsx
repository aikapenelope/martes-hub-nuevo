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

export function WhiteboardWorkspace({ tenantId, tenantName, isAdmin, canEdit, initialBoards }: WhiteboardWorkspaceProps) {
  const [boards, setBoards] = useState<WhiteboardSummary[]>(initialBoards)
  const [activeId, setActiveId] = useState<number | null>(initialBoards[0]?.id ?? null)
  const [scene, setScene] = useState<WhiteboardSceneData | null>(null)
  const [loadingScene, setLoadingScene] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const pendingSceneRef = useRef<{ id: number; scene: WhiteboardScene } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeIdRef = useRef<number | null>(activeId)
  useEffect(() => {
    activeIdRef.current = activeId
  }, [activeId])

  /** Carga la escena on demand: la lista nunca arrastra escenas completas. */
  const openBoard = useCallback((id: number) => {
    setActiveId(id)
    setSavedAt(null)
    setSaveError(null)
    setLoadingScene(true)
    startTransition(async () => {
      try {
        const result = await loadWhiteboardSceneAction(id)
        if (result.ok) {
          setScene({ elements: result.scene.elements, appState: result.scene.appState, files: result.scene.files })
        } else {
          setScene(null)
          setNotice(result.error)
        }
      } catch (err) {
        setScene(null)
        setNotice(err instanceof Error ? err.message : 'Error cargando la pizarra')
      } finally {
        setLoadingScene(false)
      }
    })
  }, [])

  // Bootstrap: primer arranque del tenant. Si el navegador tiene un whiteboard
  // de la fase localStorage (PR #83) lo migramos como pizarra del tenant;
  // si no, creamos la pizarra inicial.
  useEffect(() => {
    if (!canEdit || initialBoards.length > 0) return
    let cancelled = false
    startTransition(async () => {
      try {
        let sceneToMigrate: WhiteboardScene | null = null
        const storageKey = `martes-wb-${tenantId}`
        try {
          const raw = localStorage.getItem(storageKey)
          if (raw) {
            const parsed = JSON.parse(raw) as { elements?: unknown[] }
            if (Array.isArray(parsed.elements) && parsed.elements.length > 0) {
              sceneToMigrate = { elements: parsed.elements, files: (parsed as { files?: Record<string, unknown> }).files ?? {} }
            }
          }
        } catch {
          // localStorage corrupto o bloqueado: seguimos con pizarra vacía
        }

        const created = await createWhiteboardAction(
          sceneToMigrate ? 'Whiteboard (migrado de este navegador)' : 'Pizarra principal',
        )
        if (!created.ok || cancelled) return

        if (sceneToMigrate) {
          const saved = await saveWhiteboardAction(created.id, sceneToMigrate)
          if (saved.ok) {
            try {
              localStorage.removeItem(storageKey)
            } catch {
              // storage bloqueado: la pizarra ya vive en el server, el local se ignora
            }
          }
        }

        setBoards([{ id: created.id, title: created.title, thumbnail: null, source: 'local', updatedAt: new Date().toISOString() }])
        setActiveId(created.id)
        setScene({ elements: sceneToMigrate?.elements ?? [], files: sceneToMigrate?.files ?? {}, appState: {} })
      } catch (err) {
        if (!cancelled) setNotice(err instanceof Error ? err.message : 'Error creando la primera pizarra')
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const pending = pendingSceneRef.current
    if (!pending) return
    pendingSceneRef.current = null
    setSaveError(null)
    try {
      // La miniatura solo se regenera si la pizarra sigue en pantalla; si el
      // usuario ya cambió de pizarra, el canvas actual sería de otra escena.
      const thumbnail = pending.id === activeIdRef.current ? await generateThumbnail() : null
      const result = await saveWhiteboardAction(pending.id, pending.scene, thumbnail === null ? undefined : thumbnail)
      if (result.ok) {
        setSavedAt(formatTime(new Date()))
        setBoards((prev) => prev.map((b) => (b.id === pending.id ? { ...b, updatedAt: new Date().toISOString() } : b)))
      } else {
        setSaveError(result.error)
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Error guardando la pizarra')
    }
  }, [generateThumbnail])

  const handleSceneChange = useCallback(
    (elements: readonly unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
      const currentId = activeIdRef.current
      if (currentId == null) return
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
        void flushSave()
      }, AUTOSAVE_MS)
    },
    [flushSave],
  )

  function handleCreate() {
    const title = prompt('Nombre de la nueva pizarra:')
    if (title === null) return
    startTransition(async () => {
      try {
        const result = await createWhiteboardAction(title || 'Sin título')
        if (result.ok) {
          setBoards((prev) => [{ id: result.id, title: result.title, thumbnail: null, source: 'local', updatedAt: new Date().toISOString() }, ...prev])
          setScene({ elements: [], files: {}, appState: {} })
          setActiveId(result.id)
          setSavedAt(null)
          setSaveError(null)
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
    startTransition(async () => {
      try {
        const result = await deleteWhiteboardAction(id)
        if (result.ok) {
          setBoards((prev) => prev.filter((b) => b.id !== id))
          if (activeId === id) {
            setActiveId(boards.find((b) => b.id !== id)?.id ?? null)
            setScene(null)
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
          setActiveId(result.id)
          // Recién importada: la escena es exactamente la del archivo, no hace falta re-leerla
          try {
            const parsed = JSON.parse(raw) as { elements?: unknown[]; files?: Record<string, unknown> }
            setScene({ elements: parsed.elements ?? [], files: parsed.files ?? {}, appState: {} })
          } catch {
            setScene({ elements: [], files: {}, appState: {} })
          }
          setSavedAt(null)
          setSaveError(null)
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

      {/* Canvas — remonta limpio al alternar pizarra */}
      {activeId == null && boards.length === 0 ? (
        <div className="flex flex-1 items-center justify-center bg-zinc-950">
          <span className="max-w-sm text-center text-xs font-mono text-zinc-500">
            Sin pizarras todavía. {canEdit ? 'Crea la primera con «Nueva» o importa un archivo .excalidraw.' : 'Pide a un agente que cree la primera.'}
          </span>
        </div>
      ) : (
        <WhiteboardCanvas
          key={activeId ?? 'empty'}
          initialScene={scene}
          onSceneChange={handleSceneChange}
          onReady={(api) => {
            apiRef.current = api
          }}
        />
      )}
      {loadingScene && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-3">
          <span className="border border-zinc-800 bg-black/90 px-3 py-1 text-[10px] font-mono text-zinc-400">Cargando pizarra…</span>
        </div>
      )}
    </div>
  )
}
