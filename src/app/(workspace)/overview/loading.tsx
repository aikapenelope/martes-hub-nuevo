export default function OverviewLoading() {
  return (
    <div className="workspace-page" aria-busy="true" aria-label="Cargando resumen">
      <div className="workspace-page-head">
        <div><div className="workspace-skeleton workspace-skeleton-sm" /><div className="workspace-skeleton workspace-skeleton-title" /><div className="workspace-skeleton workspace-skeleton-copy" /></div>
      </div>
      <div className="workspace-kpis">
        {Array.from({ length: 4 }, (_, index) => <div className="workspace-card workspace-kpi workspace-skeleton-card" key={index} />)}
      </div>
      <div className="workspace-grid">
        <div className="workspace-card workspace-skeleton-panel" />
        <div className="workspace-card workspace-skeleton-panel" />
      </div>
    </div>
  )
}
