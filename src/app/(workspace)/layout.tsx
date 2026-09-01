import type { ReactNode } from 'react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { WorkspaceHeader } from '@/components/workspace/WorkspaceHeader'
import { CommandPalette } from '@/components/workspace/CommandPalette'
import { CopilotAssistant } from '@/components/workspace/CopilotAssistant'
import '@/styles/workspace.css'

// Arquitectura de múltiples root layouts: no existe app/layout.tsx compartido.
// Cada route group ((frontend), (payload), (workspace)) es su propio root layout
// independiente con su propio <html> y <body>. `/admin` (payload) permanece
// nativo y sin modificar; el workspace es una superficie de producto separada.
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
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const hasAiProvider = Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY,
  )

  return (
    <html lang="es">
      <body className="min-h-screen bg-black font-sans antialiased text-zinc-100 selection:bg-white selection:text-black">
        <WorkspaceHeader
          tenantName={tenant.name}
          userHandle={userHandle}
          userInitials={userInitials}
          isAdmin={isAdmin}
        />
        <main className="w-full space-y-5 px-4 py-5 sm:px-6 xl:px-8 2xl:px-10">{children}</main>
        <CommandPalette />
        {context.canEdit && hasAiProvider && <CopilotAssistant />}
      </body>
    </html>
  )
}
