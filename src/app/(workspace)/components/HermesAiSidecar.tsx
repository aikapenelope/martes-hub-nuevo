'use client'

import { Bot, LockKeyhole, X } from 'lucide-react'

interface HermesAiSidecarProps { isOpen: boolean; onClose: () => void }

export function HermesAiSidecar({ isOpen, onClose }: HermesAiSidecarProps) {
  return (
    <aside
      className="workspace-drawer"
      aria-label="Hermes"
      aria-hidden={!isOpen}
      style={{
        display: isOpen ? 'block' : 'none',
      }}
    >
      <div className="workspace-drawer-inner">
        <div className="workspace-drawer-head">
          <div><strong>Hermes</strong><div className="workspace-card-description">Asistente de Martes Hub</div></div>
          <button className="workspace-icon-button" type="button" onClick={onClose} aria-label="Cerrar Hermes"><X size={18} /></button>
        </div>
        <div className="workspace-drawer-copy">
          <div><Bot size={28} aria-hidden="true" /><strong>Próximamente</strong><p>Hermes se activará cuando su acceso de solo lectura, permisos por rol y aislamiento por tenant estén verificados.</p><span className="workspace-badge"><LockKeyhole size={12} aria-hidden="true" /> Sin respuestas simuladas</span></div>
        </div>
      </div>
    </aside>
  )
}
