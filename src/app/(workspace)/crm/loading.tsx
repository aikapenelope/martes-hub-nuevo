export default function CrmLoading() {
  return (
    <main className="workspace-page" aria-label="Cargando CRM" aria-busy="true">
      <div className="workspace-skeleton workspace-skeleton-sm" />
      <div className="workspace-skeleton workspace-skeleton-title" />
      <div className="workspace-skeleton workspace-skeleton-copy" />
      <div className="workspace-kpis crm-loading-kpis">
        {Array.from({ length: 4 }, (_, index) => <div className="workspace-card workspace-skeleton-card" key={index} />)}
      </div>
      <div className="workspace-card workspace-skeleton-panel crm-loading-panel" />
    </main>
  )
}
