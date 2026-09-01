/**
 * TeamPage — `/workspace/team`. Gestión del equipo del tenant activo con
 * carga de trabajo real por agente: tareas abiertas, leads a su cargo,
 * conversaciones asignadas (inbox Chatwoot) y actividad del mes.
 * Las métricas se agregan con SQL group by al pool — sin traer filas.
 */

import type { Payload } from 'payload'
import { CalendarCheck, Inbox, ListTodo, UserCog, UserRound } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { toggleUserActiveAction } from '@/lib/team-actions'
import { InviteUserDialog } from '@/components/workspace/InviteUserDialog'
import { EmptyState, KpiCard, OledCard, PageHero, StatusBadge } from '@/components/workspace/oled'
import type { User } from '@/payload-types'

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', agente: 'Agente', viewer: 'Viewer' }

interface WorkloadRow {
  userId: number | null
  total: number
}

async function countByUser(payload: Payload, sql: string, params: unknown[]): Promise<Map<number, number>> {
  const db = payload.db as { pool?: { query: (text: string, p?: unknown[]) => Promise<{ rows: WorkloadRow[] }> } }
  const map = new Map<number, number>()
  if (!db.pool || typeof db.pool.query !== 'function') return map
  const result = await db.pool.query(sql, params)
  for (const row of result.rows) {
    if (row.userId != null) map.set(row.userId, Number(row.total))
  }
  return map
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default async function TeamPage() {
  const context = await getWorkspaceContext()
  const { payload, user, tenantId, isAdmin } = context

  const [membersRes, taskCounts, leadCounts, convCounts, activityCounts] = await Promise.all([
    payload.find({
      collection: 'users',
      where: { 'tenants.tenant': { equals: tenantId } },
      depth: 0,
      limit: 100,
      sort: 'email',
      overrideAccess: false,
      user,
    }),
    // Tareas abiertas por asignado (excluye completadas/canceladas)
    countByUser(
      payload,
      `SELECT assigned_to_id AS "userId", count(*)::int AS total
       FROM tasks
       WHERE tenant_id = $1 AND status IN ('pendiente', 'en_progreso', 'bloqueada')
       GROUP BY assigned_to_id`,
      [tenantId],
    ),
    // Leads activos por owner
    countByUser(
      payload,
      `SELECT assigned_to_id AS "userId", count(*)::int AS total
       FROM leads
       WHERE tenant_id = $1 AND status IN ('nuevo', 'contactado', 'calificado')
       GROUP BY assigned_to_id`,
      [tenantId],
    ),
    // Conversaciones no resueltas asignadas (modelo Chatwoot)
    countByUser(
      payload,
      `SELECT assignee_id AS "userId", count(*)::int AS total
       FROM conversations
       WHERE tenant_id = $1 AND status != 'resolved'
       GROUP BY assignee_id`,
      [tenantId],
    ),
    // Actividades comerciales del mes por autor
    countByUser(
      payload,
      `SELECT performed_by_id AS "userId", count(*)::int AS total
       FROM activities
       WHERE tenant_id = $1 AND created_at >= date_trunc('month', now())
       GROUP BY performed_by_id`,
      [tenantId],
    ),
  ])
  const members = membersRes.docs as User[]

  const totalOpenTasks = [...taskCounts.values()].reduce((a, b) => a + b, 0)
  const totalActiveLeads = [...leadCounts.values()].reduce((a, b) => a + b, 0)
  const totalAssignedConvs = [...convCounts.values()].reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow={`Equipo · ${context.tenant.name}`}
        title="Mi Equipo"
        description="Miembros, carga de trabajo y actividad comercial del tenant."
        actions={isAdmin ? <InviteUserDialog /> : undefined}
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Miembros" value={members.length} icon={UserRound} accent="sky" note={`${members.filter((m) => m.active !== false).length} activos`} />
        <KpiCard label="Tareas abiertas" value={totalOpenTasks} icon={ListTodo} accent="amber" note="Sumadas de todo el equipo" />
        <KpiCard label="Leads en gestión" value={totalActiveLeads} icon={UserCog} accent="cyan" note="Asignados a agentes" />
        <KpiCard label="Conversaciones vivas" value={totalAssignedConvs} icon={Inbox} accent="indigo" note="Sin resolver en el inbox" />
      </section>

      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
        {members.length === 0 ? (
          <div className="lg:col-span-12">
            <OledCard>
              <EmptyState>Sin miembros registrados en este tenant.</EmptyState>
            </OledCard>
          </div>
        ) : (
          members.map((m) => {
            const name = m.firstName ? `${m.firstName}${m.lastName ? ` ${m.lastName}` : ''}` : m.email
            const isSelf = m.id === user.id
            const tasks = taskCounts.get(m.id) ?? 0
            const leads = leadCounts.get(m.id) ?? 0
            const convs = convCounts.get(m.id) ?? 0
            const monthActivities = activityCounts.get(m.id) ?? 0
            const workload = tasks + convs
            return (
              <article key={m.id} className="oled-card space-y-3 p-4 lg:col-span-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center border border-zinc-700 bg-zinc-900 text-sm font-bold text-white font-mono">
                      {initials(name)}
                    </span>
                    <div>
                      <strong className="block text-sm text-white">
                        {name}
                        {isSelf && <span className="ml-1.5 text-[10px] text-zinc-500 font-mono">(tú)</span>}
                      </strong>
                      <span className="text-[11px] text-zinc-500">{m.email}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {(m.roles ?? []).map((r) => (
                      <StatusBadge key={r} tone={r === 'admin' ? 'success' : 'neutral'}>{ROLE_LABEL[r] ?? r}</StatusBadge>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 border-t border-zinc-900 pt-3 text-center">
                  <div>
                    <p className="text-lg font-black text-white font-mono">{tasks}</p>
                    <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">Tareas</p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-white font-mono">{leads}</p>
                    <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">Leads</p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-white font-mono">{convs}</p>
                    <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">Chats</p>
                  </div>
                  <div>
                    <p className="flex items-center justify-center gap-1 text-lg font-black text-white font-mono">
                      <CalendarCheck className="h-3.5 w-3.5 text-zinc-500" />{monthActivities}
                    </p>
                    <p className="text-[9px] font-mono uppercase tracking-wider text-zinc-500">Mes</p>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                    <span>Carga activa (tareas + chats)</span>
                    <span className="font-bold text-white">{workload}</span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-900 overflow-hidden">
                    <div
                      className="h-full bg-sky-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, workload * 5)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-zinc-900 pt-2.5">
                  <StatusBadge tone={m.active === false ? 'danger' : 'success'}>{m.active === false ? 'Inactivo' : 'Activo'}</StatusBadge>
                  {isAdmin && !isSelf && (
                    <form action={toggleUserActiveAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="active" value={m.active === false ? 'true' : 'false'} />
                      <button type="submit" className="text-[10px] text-zinc-500 font-mono uppercase transition hover:text-white">
                        {m.active === false ? 'Activar' : 'Desactivar'}
                      </button>
                    </form>
                  )}
                </div>
              </article>
            )
          })
        )}
      </section>
    </div>
  )
}
