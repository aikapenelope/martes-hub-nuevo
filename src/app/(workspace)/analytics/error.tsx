'use client'

export default function AnalyticsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="workspace-page">
      <section className="workspace-card workspace-error-state" role="alert">
        <h1>No pudimos cargar los reportes de Analítica</h1>
        <p>Intenta recargar la vista para consultar las métricas del tenant.</p>
        <button className="workspace-button workspace-button-primary" onClick={reset} type="button">
          Reintentar
        </button>
      </section>
    </main>
  )
}
