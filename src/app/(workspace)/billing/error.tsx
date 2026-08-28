'use client'

export default function BillingError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="workspace-page">
      <section className="workspace-card workspace-error-state" role="alert">
        <h1>No pudimos cargar la sección de Cobranzas y Facturación</h1>
        <p>Los datos financieros permanecen seguros. Intenta consultar de nuevo.</p>
        <button className="workspace-button workspace-button-primary" onClick={reset} type="button">
          Reintentar
        </button>
      </section>
    </main>
  )
}
