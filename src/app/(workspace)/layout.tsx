import type { ReactNode } from 'react'
import { Geist } from 'next/font/google'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { WorkspaceSidebar } from '@/components/workspace/WorkspaceSidebar'
import { WorkspaceTopbar } from '@/components/workspace/WorkspaceTopbar'
import { CommandPalette } from '@/components/workspace/CommandPalette'
import { MobileNavDrawer } from '@/components/workspace/MobileNavDrawer'
import '@/styles/workspace.css'

// Fuente display del workspace (patrón dashboard-9): sans refinada para
// títulos, números y cuerpo. El mono se reserva para eyebrows, tags y
// metadatos — la identidad tipográfica es híbrida.
const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
})

export const metadata = {
  title: 'Martes Hub — Workspace',
  description: 'CRM, tareas, cobros, inbox y analítica de Martes Hub.',
}

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const context = await getWorkspaceContext()
  const { user, tenant, isAdmin } = context

  const userHandle = user.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
    : user.email.split('@')[0]
  const userInitials = userHandle
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  // Badge de fecha para el topbar
  const todayLabel = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date())

  return (
    <html lang="es">
      <body className={`${geist.variable} min-h-screen bg-black font-sans antialiased text-zinc-100 selection:bg-white selection:text-black`}>
        {/* Layout: Sidebar fijo a la izquierda + contenido derecho */}
        <div className="flex h-screen overflow-hidden">
          {/* Sidebar — oculto en mobile, siempre visible en lg+ */}
          <div className="hidden lg:flex lg:flex-col lg:shrink-0">
            <WorkspaceSidebar isAdmin={isAdmin} />
          </div>

          {/* Columna derecha: Topbar + Contenido */}
          <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
            <WorkspaceTopbar
              tenantName={tenant.name}
              userHandle={userHandle}
              userInitials={userInitials}
              isAdmin={isAdmin}
              todayLabel={todayLabel}
            />
            <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 xl:px-8">
              {children}
            </main>
          </div>
        </div>
        <CommandPalette />
        <MobileNavDrawer isAdmin={isAdmin} />
      </body>
    </html>
  )
}
