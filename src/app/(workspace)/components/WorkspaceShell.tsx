'use client'

import { useState, type ReactNode } from 'react'
import { HermesAiSidecar } from './HermesAiSidecar'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceSidebar } from './WorkspaceSidebar'

interface WorkspaceShellProps {
  userEmail?: string
  userName?: string
  tenantName: string
  isAdmin: boolean
  children: ReactNode
}

export function WorkspaceShell({ userEmail, userName, tenantName, isAdmin, children }: WorkspaceShellProps) {
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <div className="workspace-shell">
      <button className="workspace-mobile-overlay" data-open={isSidebarOpen} type="button" onClick={() => setIsSidebarOpen(false)} aria-label="Cerrar navegación" />
      <WorkspaceSidebar isOpen={isSidebarOpen} onNavigate={() => setIsSidebarOpen(false)} isAdmin={isAdmin} />
      <div className="workspace-content">
        <WorkspaceHeader userEmail={userEmail} userName={userName} tenantName={tenantName} isAiDrawerOpen={isAiDrawerOpen} onToggleSidebar={() => setIsSidebarOpen((open) => !open)} onToggleAiDrawer={() => setIsAiDrawerOpen((open) => !open)} />
        <div style={{ display: 'flex', minWidth: 0 }}>
          <main className="workspace-main" style={{ flex: 1, minWidth: 0 }}>{children}</main>
          <HermesAiSidecar isOpen={isAiDrawerOpen} onClose={() => setIsAiDrawerOpen(false)} />
        </div>
      </div>
    </div>
  )
}
