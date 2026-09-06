'use client'

// Hoja de estilos del paquete: sin ella el editor se renderiza sin tamaño,
// posicionamiento ni tema (Next App Router permite CSS global en componentes).
import '@excalidraw/excalidraw/index.css'

import dynamic from 'next/dynamic'

// Internal Excalidraw types are currently broken in this version due to missing @excalidraw/math dependency.
/* eslint-disable @typescript-eslint/no-explicit-any */
type ExcalidrawElement = any;
type AppState = any;
type BinaryFiles = any;
type ExcalidrawImperativeAPI = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export type { ExcalidrawImperativeAPI }

export interface WhiteboardSceneData {
  elements: readonly ExcalidrawElement[]
  appState?: Partial<AppState>
  files?: BinaryFiles
}

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
  initialScene?: WhiteboardSceneData | null
  /** Viewers sin permiso de edición: canvas en modo vista (no editable). */
  viewModeEnabled?: boolean
  /** Cada cambio de la escena (el padre decide el debounce del autosave). */
  onSceneChange: (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => void
  /** API imperativa para exportar escena/miniatura desde el padre. */
  onReady: (api: ExcalidrawImperativeAPI) => void
}

export function WhiteboardCanvas({ initialScene, viewModeEnabled, onSceneChange, onReady }: WhiteboardCanvasProps) {
  return (
    <div className="flex-1" style={{ backgroundColor: '#000000' }}>
      <Excalidraw
        excalidrawAPI={onReady}
        initialData={initialScene ?? undefined}
        onChange={onSceneChange}
        viewModeEnabled={viewModeEnabled}
        theme="dark"
        UIOptions={{
          canvasActions: {
            toggleTheme: false,
            export: false, // usamos el nuestro
          },
        }}
      />
    </div>
  )
}
