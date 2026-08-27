import type { ReactNode } from 'react'
import { WorkspaceShell } from './components/WorkspaceShell'
import { getWorkspaceContext } from '@/lib/workspace-context'
import '../(frontend)/styles.css'
import './workspace.css'

export const metadata = {
  title: 'Martes Hub — Centro de operaciones',
  description: 'CRM, comunicación, tareas, cobros y analítica de Martes Hub.',
}

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { user, tenant, isAdmin } = await getWorkspaceContext()
  const userName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : undefined

  return (
    <html lang="es" className="workspace-body">
      <body className="workspace-body">
        <WorkspaceShell userEmail={user.email} userName={userName} tenantName={tenant.name} isAdmin={isAdmin}>
          {children}
        </WorkspaceShell>
      </body>
    </html>
  )
}
