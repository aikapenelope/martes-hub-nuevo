'use client'

import dynamic from 'next/dynamic'
import { useState, useCallback, useRef } from 'react'
import { Download, Trash2, Save } from 'lucide-react'
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

function loadFromStorage(tenantId: string): { elements: ExcalidrawElement[]; appState: Partial<AppState> } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY(tenantId))
    if (!raw) return null
    return JSON.parse(raw) as { elements: ExcalidrawElement[]; appState: Partial<AppState> }
  } catch {
    return null
  }
}

function saveToStorage(tenantId: string, elements: readonly ExcalidrawElement[], appState: AppState) {
  if (typeof window === 'undefined') return
  try {
    const data = {
      elements,
      appState: {
        // Solo guardar el viewport, no todo el appState para evitar datos sensibles
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom,
      },
    }
    localStorage.setItem(STORAGE_KEY(tenantId), JSON.stringify(data))
  } catch {}
}

export function WhiteboardCanvas({ tenantId, tenantName }: WhiteboardCanvasProps) {
  const savedData = loadFromStorage(tenantId)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  // Ref para acceder a la API de Excalidraw
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null)

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, _files: BinaryFiles) => {
      saveToStorage(tenantId, elements, appState)
      setSavedAt(
        new Intl.DateTimeFormat('es-VE', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          timeZone: 'America/Caracas',
        }).format(new Date()),
      )
    },
    [tenantId],
  )

  function handleClear() {
    if (!confirm('¿Borrar todo el whiteboard? Esta acción no se puede deshacer.')) return
    localStorage.removeItem(STORAGE_KEY(tenantId))
    window.location.reload()
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
          {savedAt && (
            <span className="hidden text-[10px] font-mono text-zinc-600 sm:block">
              <Save size={10} className="inline mr-1" />
              Guardado {savedAt}
            </span>
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
          initialData={savedData ?? undefined}
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
