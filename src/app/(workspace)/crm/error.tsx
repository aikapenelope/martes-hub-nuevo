'use client'

export default function CrmError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="workspace-page">
      <section className="workspace-card workspace-error-state" role="alert">
        <h1>No pudimos cargar el CRM</h1>
        <p>La sesión sigue protegida y no se mostraron datos parciales. Intenta consultar de nuevo.</p>
        <button className="workspace-button workspace-button-primary" onClick={reset} type="button">Reintentar</button>
      </section>
    </main>
  )
}
