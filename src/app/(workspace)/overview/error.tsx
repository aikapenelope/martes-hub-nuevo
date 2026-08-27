'use client'

import { RotateCcw } from 'lucide-react'

export default function OverviewError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="workspace-page">
      <div className="workspace-card workspace-error-state" role="alert">
        <h1>No pudimos cargar el resumen</h1>
        <p>La información está segura. Intenta cargarla de nuevo o entra a Payload Admin si el problema continúa.</p>
        <button className="workspace-button workspace-button-primary" type="button" onClick={reset}><RotateCcw size={16} /> Reintentar</button>
      </div>
    </div>
  )
}
