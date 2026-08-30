/**
 * TeamPage — `/workspace/team`. Gestión del equipo del tenant activo.
 * Antes invitar a alguien o cambiar su rol solo se podía hacer desde
 * `/admin` — no había ninguna página de "mi equipo" en el workspace.
 */

import { UserCog } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { toggleUserActiveAction } from '@/lib/team-actions'
import { InviteUserDialog } from '@/components/workspace/InviteUserDialog'
import { EmptyState, OledCard, PageHero, StatusBadge } from '@/components/workspace/oled'
import type { User } from '@/payload-types'

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', agente: 'Agente', viewer: 'Viewer' }

export default async function TeamPage() {
  const context = await getWorkspaceContext()
  const { payload, user, tenantId, isAdmin } = context

  const membersRes = await payload.find({
    collection: 'users',
    where: { 'tenants.tenant': { equals: tenantId } },
    depth: 0,
    limit: 100,
    sort: 'email',
    overrideAccess: false,
    user,
  })
  const members = membersRes.docs as User[]

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={`Equipo · ${context.tenant.name}`}
        title="Mi Equipo"
        description="Miembros con acceso al workspace de este tenant."
        actions={isAdmin ? <InviteUserDialog /> : undefined}
      />

      <OledCard className="!p-0">
        {members.length === 0 ? (
          <EmptyState>Sin miembros registrados en este tenant.</EmptyState>
        ) : (
          <div className="flex flex-col">
            {members.map((m) => {
              const name = m.firstName ? `${m.firstName}${m.lastName ? ` ${m.lastName}` : ''}` : m.email
              const isSelf = m.id === user.id
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 border-b border-zinc-900 px-4 py-3 last:border-0">
                  <div className="flex items-center gap-2.5">
                    <UserCog className="w-4 h-4 text-zinc-500" />
                    <div>
                      <strong className="block text-sm text-white">{name}{isSelf && <span className="ml-1.5 text-[10px] text-zinc-500 font-mono">(tú)</span>}</strong>
                      <span className="text-[11px] text-zinc-500">{m.email}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(m.roles ?? []).map((r) => (
                      <StatusBadge key={r} tone={r === 'admin' ? 'success' : 'neutral'}>{ROLE_LABEL[r] ?? r}</StatusBadge>
                    ))}
                    <StatusBadge tone={m.active === false ? 'danger' : 'success'}>{m.active === false ? 'Inactivo' : 'Activo'}</StatusBadge>
                    {isAdmin && !isSelf && (
                      <form action={toggleUserActiveAction}>
                        <input type="hidden" name="id" value={m.id} />
                        <input type="hidden" name="active" value={m.active === false ? 'true' : 'false'} />
                        <button type="submit" className="text-[10px] text-zinc-500 hover:text-white font-mono uppercase">
                          {m.active === false ? 'Activar' : 'Desactivar'}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </OledCard>
    </div>
  )
}
