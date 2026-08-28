'use client'

export default function InboxError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="workspace-page">
      <section className="workspace-card workspace-error-state" role="alert">
        <h1>No pudimos cargar el Inbox de Mensajería</h1>
        <p>Hubo un problema al cargar los hilos de conversación. Intenta de nuevo.</p>
        <button className="workspace-button workspace-button-primary" onClick={reset} type="button">
          Reintentar
        </button>
      </section>
    </main>
  )
}
