/**
 * TeamPage — `/workspace/team`. Gestión del equipo del tenant activo con
 * carga de trabajo real por agente: tareas abiertas, leads a su cargo,
 * conversaciones asignadas (inbox Chatwoot) y actividad del mes.
 * Las métricas se agregan con SQL group by al pool — sin traer filas.
 * UI migrada a shadcn (Card/Badge/Empty) — solo presentación.
 */

import type { Payload } from 'payload'
import { CalendarCheck, Inbox, ListTodo, UserCog, UserRound } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { toggleUserActiveAction } from '@/lib/team-actions'
import { InviteUserDialog } from '@/components/workspace/InviteUserDialog'
import { KpiCard } from '@/components/workspace/kpi-card'
import { PageHeader } from '@/components/workspace/page-header'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@/components/ui/empty'
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
			pagination: false,
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
			 WHERE tenant_id = $1 AND occurred_at >= date_trunc('month', now())
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
			<PageHeader
				eyebrow={`Equipo · ${context.tenant.name}`}
				title="Mi Equipo"
				description="Miembros, carga de trabajo y actividad comercial del tenant."
				actions={isAdmin ? <InviteUserDialog /> : undefined}
			/>

			<section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<KpiCard
					label="Miembros"
					value={members.length}
					icon={UserRound}
					accent="sky"
					note={`${members.filter((m) => m.active !== false).length} activos`}
				/>
				<KpiCard label="Tareas abiertas" value={totalOpenTasks} icon={ListTodo} accent="amber" note="Sumadas de todo el equipo" />
				<KpiCard label="Leads en gestión" value={totalActiveLeads} icon={UserCog} accent="cyan" note="Asignados a agentes" />
				<KpiCard label="Conversaciones vivas" value={totalAssignedConvs} icon={Inbox} accent="indigo" note="Sin resolver en el inbox" />
			</section>

			<section className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
				{members.length === 0 ? (
					<div className="lg:col-span-12">
						<Card className="gap-0 py-4">
							<CardContent className="px-4">
								<Empty>
									<EmptyHeader>
										<EmptyMedia variant="icon">
											<UserRound />
										</EmptyMedia>
										<EmptyTitle>Sin miembros registrados en este tenant.</EmptyTitle>
										<EmptyDescription>Invita al primer miembro del equipo para empezar a operar.</EmptyDescription>
									</EmptyHeader>
								</Empty>
							</CardContent>
						</Card>
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
							<Card key={m.id} className="space-y-3 py-4 lg:col-span-4">
								<CardContent className="space-y-3 px-4">
									<div className="flex items-start justify-between gap-2">
										<div className="flex items-center gap-3">
											<Avatar className="h-10 w-10 rounded-sm border border-border font-mono text-sm font-bold">
												<AvatarFallback>{initials(name)}</AvatarFallback>
											</Avatar>
											<div>
												<strong className="block text-sm text-foreground">
													{name}
													{isSelf && <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">(tú)</span>}
												</strong>
												<span className="text-[11px] text-muted-foreground">{m.email}</span>
											</div>
										</div>
										<div className="flex flex-col items-end gap-1">
											{(m.roles ?? []).map((r) => (
												<Badge key={r} variant={r === 'admin' ? 'success' : 'outline'}>
													{ROLE_LABEL[r] ?? r}
												</Badge>
											))}
										</div>
									</div>

									<div className="grid grid-cols-4 gap-2 border-t pt-3 text-center">
										<div>
											<p className="font-mono text-lg font-black text-foreground">{tasks}</p>
											<p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Tareas</p>
										</div>
										<div>
											<p className="font-mono text-lg font-black text-foreground">{leads}</p>
											<p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Leads</p>
										</div>
										<div>
											<p className="font-mono text-lg font-black text-foreground">{convs}</p>
											<p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Chats</p>
										</div>
										<div>
											<p className="flex items-center justify-center gap-1 font-mono text-lg font-black text-foreground">
												<CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
												{monthActivities}
											</p>
											<p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Mes</p>
										</div>
									</div>

									<div className="space-y-1">
										<div className="flex justify-between font-mono text-[10px] text-muted-foreground">
											<span>Carga activa (tareas + chats)</span>
											<span className="font-bold text-foreground">{workload}</span>
										</div>
										<div className="h-1.5 w-full overflow-hidden bg-muted">
											<div
												className="h-full bg-sky-500 transition-all duration-300"
												style={{ width: `${Math.min(100, workload * 5)}%` }}
											/>
										</div>
									</div>

									<div className="flex items-center justify-between border-t pt-2.5">
										{m.active === false ? (
											<Badge variant="destructive">Inactivo</Badge>
										) : (
											<Badge variant="success">Activo</Badge>
										)}
										{isAdmin && !isSelf && (
											<form action={toggleUserActiveAction}>
												<input type="hidden" name="id" value={m.id} />
												<input type="hidden" name="active" value={m.active === false ? 'true' : 'false'} />
												<Button
													type="submit"
													variant="ghost"
													size="sm"
													className="h-auto px-2 py-1 font-mono text-[10px] uppercase text-muted-foreground hover:text-foreground"
												>
													{m.active === false ? 'Activar' : 'Desactivar'}
												</Button>
											</form>
										)}
									</div>
								</CardContent>
							</Card>
						)
					})
				)}
			</section>
		</div>
	)
}
