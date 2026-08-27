'use client'

import { Bot, Menu, Search } from 'lucide-react'

interface WorkspaceHeaderProps {
  userEmail?: string
  userName?: string
  tenantName: string
  onToggleSidebar: () => void
  onToggleAiDrawer: () => void
  isAiDrawerOpen: boolean
}

export function WorkspaceHeader({ userEmail, userName, tenantName, onToggleSidebar, onToggleAiDrawer, isAiDrawerOpen }: WorkspaceHeaderProps) {
  const displayName = userName || userEmail?.split('@')[0] || 'Agente'

  return (
    <header className="workspace-header">
      <div className="workspace-header-left">
        <button className="workspace-icon-button workspace-mobile-trigger" type="button" onClick={onToggleSidebar} aria-label="Abrir navegación"><Menu size={18} /></button>
        <button className="workspace-search" type="button" aria-label="Buscar en Martes Hub">
          <Search size={16} aria-hidden="true" /><span>Buscar clientes, leads y tareas</span><kbd>⌘ K</kbd>
        </button>
      </div>
      <div className="workspace-header-right">
        <div className="workspace-user">
          <span className="workspace-user-copy"><strong>{displayName}</strong><span>{tenantName}</span></span>
          <span className="workspace-avatar" aria-hidden="true">{displayName.charAt(0).toUpperCase()}</span>
        </div>
        <button className="workspace-icon-button" type="button" onClick={onToggleAiDrawer} aria-label={isAiDrawerOpen ? 'Cerrar Hermes' : 'Abrir Hermes'} aria-pressed={isAiDrawerOpen}>
          <Bot size={18} />
        </button>
      </div>
    </header>
  )
}
