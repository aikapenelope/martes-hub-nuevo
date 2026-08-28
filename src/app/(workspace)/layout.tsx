import type { ReactNode } from 'react'
import type { Notification } from '@/payload-types'
import { WorkspaceShell } from './components/WorkspaceShell'
import { getWorkspaceContext } from '@/lib/workspace-context'
import '../(frontend)/styles.css'
import './workspace.css'

// Arquitectura de múltiples root layouts: no existe app/layout.tsx compartido.
// Cada route group ((frontend), (payload), (workspace)) es su propio root layout
// independiente con su propio <html> y <body>. Este patrón es válido y documentado
// en Next.js App Router para aplicaciones con secciones visualmente distintas.
export const metadata = {
  title: 'Martes Hub — Centro de operaciones',
  description: 'CRM, comunicación, tareas, cobros y analítica de Martes Hub.',
}

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { user, tenant, tenantId, isAdmin, payload } = await getWorkspaceContext()
  const userName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : undefined

  // Notificaciones no leídas del tenant — se pasan al header para el bell badge.
  // limit: 5 para el panel; el totalDocs da el count real. overrideAccess: false + user
  // respeta el aislamiento por tenant del plugin multi-tenant (QUERIES.md).
  const notifsResult = await payload.find({
    collection: 'notifications',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { read: { equals: false } },
      ],
    },
    limit: 5,
    sort: '-createdAt',
    depth: 0,
    overrideAccess: false,
    user,
  })

  const notifications = notifsResult.docs as Pick<Notification, 'id' | 'title' | 'severity' | 'createdAt'>[]
  const unreadCount = notifsResult.totalDocs

  return (
    <html lang="es">
      <body className="workspace-body">
        <WorkspaceShell
          userEmail={user.email}
          userName={userName}
          tenantName={tenant.name}
          isAdmin={isAdmin}
          notifications={notifications}
          unreadCount={unreadCount}
        >
          {children}
        </WorkspaceShell>
      </body>
    </html>
  )
}
