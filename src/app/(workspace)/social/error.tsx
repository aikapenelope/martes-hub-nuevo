'use client'

export default function SocialError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="workspace-page">
      <section className="workspace-card workspace-error-state" role="alert">
        <h1>No pudimos cargar el Social Hub</h1>
        <p>El calendario editorial y las cuentas no pudieron sincronizarse. Intenta de nuevo.</p>
        <button className="workspace-button workspace-button-primary" onClick={reset} type="button">
          Reintentar
        </button>
      </section>
    </main>
  )
}
