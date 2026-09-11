import type { ReactNode } from 'react'
import { Geist } from 'next/font/google'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { AppShell } from '@/components/app-shell'
import { CommandPalette } from '@/components/workspace/CommandPalette'
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
    <html lang="es" className="dark">
      <body className={`${geist.variable} min-h-screen font-sans antialiased selection:bg-primary selection:text-primary-foreground`}>
        {/* Shell (fase 1 de UI-MIGRATION): sidebar colapsable + header sticky,
         * móvil incluido. El contenido hereda centrado y espaciados. */}
        <AppShell
          user={{
            name: userHandle,
            email: user.email,
            initials: userInitials || 'MH',
            isAdmin,
          }}
          tenantName={tenant.name}
          todayLabel={todayLabel}
        >
          {children}
          <CommandPalette />
        </AppShell>
      </body>
    </html>
  )
}
