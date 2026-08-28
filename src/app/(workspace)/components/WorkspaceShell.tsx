'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { Notification } from '@/payload-types'
import { HermesAiSidecar } from './HermesAiSidecar'
import { WorkspaceHeader } from './WorkspaceHeader'
import { WorkspaceSidebar } from './WorkspaceSidebar'

interface WorkspaceShellProps {
  userEmail?: string
  userName?: string
  tenantName: string
  isAdmin: boolean
  notifications: Pick<Notification, 'id' | 'title' | 'severity' | 'createdAt'>[]
  unreadCount: number
  children: ReactNode
}

export function WorkspaceShell({ userEmail, userName, tenantName, isAdmin, notifications, unreadCount, children }: WorkspaceShellProps) {
  const router = useRouter()
  const [isAiDrawerOpen, setIsAiDrawerOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        // Búsqueda global: navega al CRM donde vive el buscador de leads/clientes
        router.push('/crm')
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setIsAiDrawerOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [router])

  return (
    <div className="workspace-shell">
      <button className="workspace-mobile-overlay" data-open={isSidebarOpen} type="button" onClick={() => setIsSidebarOpen(false)} aria-label="Cerrar navegación" />
      <WorkspaceSidebar isOpen={isSidebarOpen} onNavigate={() => setIsSidebarOpen(false)} isAdmin={isAdmin} />
      <div className="workspace-content">
        <WorkspaceHeader
          userEmail={userEmail}
          userName={userName}
          tenantName={tenantName}
          isAiDrawerOpen={isAiDrawerOpen}
          onToggleSidebar={() => setIsSidebarOpen((open) => !open)}
          onToggleAiDrawer={() => setIsAiDrawerOpen((open) => !open)}
          notifications={notifications}
          unreadCount={unreadCount}
        />
        <div style={{ display: 'flex', minWidth: 0 }}>
          <main className="workspace-main" style={{ flex: 1, minWidth: 0 }}>{children}</main>
          <HermesAiSidecar isOpen={isAiDrawerOpen} onClose={() => setIsAiDrawerOpen(false)} />
        </div>
      </div>
    </div>
  )
}