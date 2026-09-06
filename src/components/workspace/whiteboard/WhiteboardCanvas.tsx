'use client'

// Hoja de estilos del paquete: sin ella el editor se renderiza sin tamaño,
// posicionamiento ni tema (Next App Router permite CSS global en componentes).
import '@excalidraw/excalidraw/index.css'

import dynamic from 'next/dynamic'
import { useState, useCallback, useRef } from 'react'
import { Download, Trash2, Save, TriangleAlert } from 'lucide-react'
// Internal Excalidraw types are currently broken in this version due to missing @excalidraw/math dependency.
type ExcalidrawElement = any;
type AppState = any;
type BinaryFiles = any;
type ExcalidrawImperativeAPI = any;

// Excalidraw NO soporta SSR — siempre dynamic con ssr: false
const Excalidraw = dynamic(
  async () => {
    const { Excalidraw } = await import('@excalidraw/excalidraw')
    return Excalidraw
  },
  { ssr: false, loading: () => <WhiteboardSkeleton /> },
)

function WhiteboardSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-zinc-950">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin border-2 border-zinc-700 border-t-white rounded-full" />
        <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Cargando canvas...</span>
      </div>
    </div>
  )
}

interface WhiteboardCanvasProps {
  tenantId: string
  tenantName: string
}

const STORAGE_KEY = (tenantId: string) => `martes-wb-${tenantId}`

interface StoredWhiteboard {
  elements: readonly ExcalidrawElement[]
  appState: Partial<AppState>
  files: BinaryFiles
}

type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' }

const SAVE_ERROR_COPY: Record<Exclude<SaveResult, { ok: true }>['reason'], string> = {
  quota: 'El whiteboard supera el espacio de guardado del navegador (≈5 MB) — quita imágenes o exporta y empieza uno nuevo. Los cambios recientes NO quedaron guardados.',
  unavailable: 'El almacenamiento del navegador no está disponible — los cambios no se guardarán.',
}

function loadFromStorage(tenantId: string): StoredWhiteboard | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY(tenantId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredWhiteboard>
    if (!Array.isArray(parsed.elements)) return null
    return {
      elements: parsed.elements,
      appState: parsed.appState ?? {},
      // Las imágenes viven como dataURL dentro de files; sin esto desaparecen al recargar
      files: parsed.files ?? {},
    }
  } catch {
    return null
  }
}

function saveToStorage(
  tenantId: string,
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
): SaveResult {
  if (typeof window === 'undefined') return { ok: false, reason: 'unavailable' }
  try {
    const data: StoredWhiteboard = {
      elements,
      files,
      appState: {
        // Solo guardar el viewport, no todo el appState para evitar datos sensibles
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom,
      },
    }
    localStorage.setItem(STORAGE_KEY(tenantId), JSON.stringify(data))
    return { ok: true }
  } catch (err) {
    const quota =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22)
    return { ok: false, reason: quota ? 'quota' : 'unavailable' }
  }
}

export function WhiteboardCanvas({ tenantId, tenantName }: WhiteboardCanvasProps) {
  // Cargar la escena una sola vez, no en cada render
  const [initialScene] = useState(() => loadFromStorage(tenantId))
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // Ref para acceder a la API de Excalidraw
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null)

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      const result = saveToStorage(tenantId, elements, appState, files)
      if (result.ok) {
        setSaveError(null)
        setSavedAt(
          new Intl.DateTimeFormat('es-VE', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: 'America/Caracas',
          }).format(new Date()),
        )
      } else {
        // Guardado fallido: no avanzar savedAt — el usuario debe saber que
        // hay trabajo sin durar antes de cerrar la pestaña.
        setSaveError(SAVE_ERROR_COPY[result.reason])
      }
    },
    [tenantId],
  )

  function handleClear() {
    if (!confirm('¿Borrar todo el whiteboard? Esta acción no se puede deshacer.')) return
    // El reload va en finally: si el storage está bloqueado, removeItem
    // lanza y sin esto el board en memoria nunca se resetea.
    try {
      localStorage.removeItem(STORAGE_KEY(tenantId))
    } finally {
      window.location.reload()
    }
  }

  function handleExportPNG() {
    if (!excalidrawAPIRef.current) return
    import('@excalidraw/excalidraw').then(({ exportToBlob }) => {
      exportToBlob({
        elements: excalidrawAPIRef.current!.getSceneElements(),
        appState: excalidrawAPIRef.current!.getAppState(),
        files: excalidrawAPIRef.current!.getFiles(),
        mimeType: 'image/png',
      }).then((blob: Blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `whiteboard-${tenantId}-${Date.now()}.png`
        a.click()
        URL.revokeObjectURL(url)
      })
    })
  }

  return (
    <div className="relative flex h-full flex-col bg-zinc-950">
      {/* Toolbar superior del whiteboard */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-800 bg-black px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
            Whiteboard · {tenantName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {saveError ? (
            <span
              className="flex max-w-md items-center gap-1.5 border border-red-900 bg-red-950/60 px-2.5 py-1 text-[10px] font-mono text-red-300"
              role="alert"
            >
              <TriangleAlert size={11} className="shrink-0" />
              {saveError}
            </span>
          ) : (
            savedAt && (
              <span className="hidden text-[10px] font-mono text-zinc-600 sm:block">
                <Save size={10} className="inline mr-1" />
                Guardado {savedAt}
              </span>
            )
          )}
          <button
            type="button"
            onClick={handleExportPNG}
            className="flex items-center gap-1.5 border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-mono text-zinc-400 transition hover:border-zinc-500 hover:text-white"
          >
            <Download size={11} /> Exportar PNG
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] font-mono text-zinc-600 transition hover:border-red-900 hover:text-red-400"
          >
            <Trash2 size={11} /> Borrar todo
          </button>
        </div>
      </div>

      {/* Canvas de Excalidraw */}
      <div className="flex-1" style={{ backgroundColor: '#000000' }}>
        <Excalidraw
          excalidrawAPI={api => { excalidrawAPIRef.current = api }}
          initialData={initialScene ? { elements: initialScene.elements, appState: initialScene.appState, files: initialScene.files } : undefined}
          onChange={handleChange}
          theme="dark"
          UIOptions={{
            canvasActions: {
              toggleTheme: false,
              export: false, // usamos el nuestro
            },
          }}
        />
      </div>
    </div>
  )
}
