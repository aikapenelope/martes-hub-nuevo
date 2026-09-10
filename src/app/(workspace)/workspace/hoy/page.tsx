import 'server-only'

import Link from 'next/link'
import {
	AlertTriangle,
	Calendar,
	Check,
	CheckCircle2,
	CheckSquare,
	CreditCard,
	MessageCircle,
	RefreshCw,
	Sparkles,
} from 'lucide-react'

import { getUpcomingAgenda } from '@/lib/agenda-data'
import { collectFollowupsToday } from '@/lib/followups-today'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { TaskCreateDialog } from '@/components/workspace/TaskCreateDialog'
import { FollowupsTriage } from '@/components/workspace/hoy/FollowupsTriage'
import { PageHeader } from '@/components/workspace/page-header'
import { getAssignableUsers } from '@/lib/tasks-data'
import { changeTaskStatusAction } from '@/lib/tasks-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Client, Lead, Payment, Task } from '@/payload-types'

const priorityVariant: Record<string, 'outline' | 'warning' | 'destructive'> = {
	baja: 'outline',
	media: 'outline',
	alta: 'warning',
	urgente: 'destructive',
}

const usd = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

export default async function HoyPage() {
	const context = await getWorkspaceContext()

	// Obtener zona horaria configurada para el tenant activo
	const settingsRes = await context.payload.find({
		collection: 'company-settings',
		where: { tenant: { equals: context.tenantId } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	})
	const timeZone = settingsRes.docs[0]?.timezone || 'America/Caracas'

	const now = new Date()
	let isoDateStr = ''
	try {
		isoDateStr = new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).format(now)
	} catch {
		isoDateStr = now.toISOString().slice(0, 10)
	}

	const startOfToday = new Date(`${isoDateStr}T00:00:00Z`)

	const [
		agendaItems,
		followups,
		overdueTasksRes,
		overduePaymentsRes,
		assignees,
		clientsRes,
		leadsRes,
	] = await Promise.all([
		getUpcomingAgenda({
			payload: context.payload,
			tenantId: context.tenantId,
			user: context.user,
			days: 1,
			since: startOfToday,
		}),
		collectFollowupsToday({
			payload: context.payload,
			user: context.user,
			tenantId: context.tenantId,
		}),
		context.payload.find({
			collection: 'tasks',
			limit: 20,
			sort: 'dueDate',
			depth: 0,
			overrideAccess: false,
			user: context.user,
			where: {
				and: [
					{ tenant: { equals: context.tenantId } },
					{ dueDate: { less_than: startOfToday.toISOString() } },
					{ status: { not_in: ['completada', 'cancelada'] } },
				],
			},
		}),
		context.payload.find({
			collection: 'payments',
			limit: 20,
			sort: 'dueDate',
			depth: 1,
			overrideAccess: false,
			user: context.user,
			where: {
				and: [
					{ tenant: { equals: context.tenantId } },
					{ dueDate: { less_than: startOfToday.toISOString() } },
					{ status: { in: ['pendiente', 'vencido'] } },
				],
			},
		}),
		getAssignableUsers({
			payload: context.payload,
			user: context.user,
			tenantId: context.tenantId,
		}),
		context.payload.find({
			collection: 'clients',
			depth: 0,
			limit: 100,
			sort: 'name',
			where: { tenant: { equals: context.tenantId } },
			select: { name: true },
			overrideAccess: false,
			user: context.user,
		}),
		context.payload.find({
			collection: 'leads',
			depth: 0,
			limit: 100,
			sort: 'fullName',
			where: { tenant: { equals: context.tenantId } },
			select: { fullName: true },
			overrideAccess: false,
			user: context.user,
		}),
	])

	const appointments = agendaItems.filter((i) => i.type === 'cita')
	const tasks = agendaItems.filter((i) => i.type === 'task')
	const payments = agendaItems.filter((i) => i.type === 'payment')
	const overdueTasks = overdueTasksRes.docs as Task[]
	const overduePayments = overduePaymentsRes.docs as Payment[]
	// KPI de mora basado en totalDocs: las consultas de documentos vienen limitadas a 20
	// para el preview visual, pero el total debe reflejar TODAS las tareas/cobros vencidos.
	const totalOverdue = (overdueTasksRes.totalDocs ?? 0) + (overduePaymentsRes.totalDocs ?? 0)
	const totalCommitments = appointments.length + tasks.length + payments.length

	let todayDateFormatted = ''
	try {
		todayDateFormatted = new Intl.DateTimeFormat('es', {
			timeZone,
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
		}).format(now)
	} catch {
		todayDateFormatted = new Intl.DateTimeFormat('es', {
			weekday: 'long',
			day: 'numeric',
			month: 'long',
			year: 'numeric',
		}).format(now)
	}

	const kpis = [
		{ label: 'Citas hoy', value: appointments.length, icon: Calendar, iconCls: 'text-sky-400' },
		{ label: 'Tareas hoy', value: tasks.length, icon: CheckSquare, iconCls: 'text-amber-400' },
		{ label: 'Cobros hoy', value: payments.length, icon: CreditCard, iconCls: 'text-emerald-400' },
		{ label: 'A contactar', value: followups.length, icon: MessageCircle, iconCls: 'text-[#25d366]' },
	]

	return (
		<div className="space-y-6">
			<PageHeader
				eyebrow={`Briefing Diario · ${context.tenant.name}`}
				title={todayDateFormatted}
				description="Centro de operaciones del día: compromisos agendados, tareas pendientes y seguimientos prioritarios."
				actions={
					<>
						{context.canEdit && (
							<TaskCreateDialog
								assignees={assignees}
								clients={clientsRes.docs as Client[]}
								leads={leadsRes.docs as Lead[]}
								variant="primary"
								redirectTo="/workspace/hoy"
							/>
						)}
						<Button variant="outline" size="sm" asChild>
							<Link href="/workspace/hoy">
								<RefreshCw /> Actualizar
							</Link>
						</Button>
					</>
				}
			/>

			{/* KPI Cards Strip */}
			<section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
				{kpis.map((kpi) => (
					<Card key={kpi.label} className="gap-0 py-3.5">
						<CardContent className="px-3.5">
							<div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
								<kpi.icon className={`h-4 w-4 ${kpi.iconCls}`} /> {kpi.label}
							</div>
							<p className="mt-2 font-mono text-2xl font-bold text-foreground">{kpi.value}</p>
						</CardContent>
					</Card>
				))}
				<Card className="gap-0 py-3.5">
					<CardContent className="px-3.5">
						<div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
							<AlertTriangle className={`h-4 w-4 ${totalOverdue > 0 ? 'text-red-400' : 'text-muted-foreground'}`} /> Vencidas
						</div>
						<p className={`mt-2 font-mono text-2xl font-bold ${totalOverdue > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
							{totalOverdue}
						</p>
					</CardContent>
				</Card>
			</section>

			{/* Alerta de Vencidas si existen compromisos atrasados */}
			{totalOverdue > 0 && (
				<section className="space-y-3 border border-red-900/60 bg-red-950/20 p-4">
					<div className="flex items-center justify-between border-b border-red-900/40 pb-2">
						<div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-red-300">
							<AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
							<span>Atención Prioritaria: Compromisos con Vencimiento Atrasado ({totalOverdue})</span>
						</div>
						<span className="font-mono text-[11px] text-red-400/80">Requieren acción inmediata</span>
					</div>

					<div className="grid gap-3 sm:grid-cols-2">
						{overdueTasks.map((t) => (
							<div
								key={`overdue-t-${t.id}`}
								className="flex items-center justify-between gap-3 border border-red-900/40 bg-background/80 p-3 text-xs"
							>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<Badge variant="destructive" className="text-[9px] uppercase">
											Tarea vencida
										</Badge>
										<Badge variant={priorityVariant[t.priority] ?? 'outline'} className="text-[10px] lowercase">
											{t.priority}
										</Badge>
									</div>
									<strong className="mt-1 block truncate text-foreground">{t.title}</strong>
									<span className="font-mono text-[10px] text-muted-foreground">
										Límite: {t.dueDate?.slice(0, 10)}
									</span>
								</div>
								<div className="flex shrink-0 items-center gap-2">
									{context.canEdit && (
										<form action={changeTaskStatusAction}>
											<input type="hidden" name="id" value={t.id} />
											<input type="hidden" name="status" value="completada" />
											<Button
												type="submit"
												variant="outline"
												size="icon"
												title="Marcar como completada"
												className="h-7 w-7 text-muted-foreground hover:text-emerald-300"
											>
												<Check className="h-3.5 w-3.5" />
											</Button>
										</form>
									)}
									<Link
										href={`/workspace/tasks/${t.id}`}
										className="font-mono text-xs text-sky-400 underline hover:text-foreground"
									>
										Ver
									</Link>
								</div>
							</div>
						))}

						{overduePayments.map((p) => {
							const clientObj = typeof p.client === 'object' && p.client ? (p.client as Client) : null
							return (
								<div
									key={`overdue-p-${p.id}`}
									className="flex items-center justify-between gap-3 border border-red-900/40 bg-background/80 p-3 text-xs"
								>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<Badge variant="destructive" className="text-[9px] uppercase">
												Cobro vencido
											</Badge>
											<span className="font-mono text-[10px] font-bold text-emerald-400">
												{usd.format(p.amount)}
											</span>
										</div>
										<strong className="mt-1 block truncate text-foreground">
											{clientObj?.name ?? 'Cliente'}
										</strong>
										<span className="font-mono text-[10px] text-muted-foreground">
											Venció: {p.dueDate?.slice(0, 10)}
										</span>
									</div>
									<Button
										asChild
										variant="outline"
										size="sm"
										className="shrink-0 border-emerald-500/30 bg-emerald-500/10 font-mono text-xs font-bold uppercase text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
									>
										<Link href="/workspace/billing">Cobrar →</Link>
									</Button>
								</div>
							)
						})}
					</div>
				</section>
			)}

			{/* Main Grid: Agenda & Followups */}
			<div className="grid gap-6 lg:grid-cols-2">
				{/* Agenda del Día */}
				<div className="space-y-4">
					<Card className="gap-0 py-5">
						<CardHeader className="flex flex-row items-center justify-between gap-2 border-b px-5 pb-3">
							<CardTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider">
								<Calendar className="h-4 w-4" />
								Agenda del Día
							</CardTitle>
							<span className="font-mono text-xs text-muted-foreground">
								{totalCommitments} {totalCommitments === 1 ? 'compromiso' : 'compromisos'}
							</span>
						</CardHeader>
						<CardContent className="mt-2">
							{totalCommitments === 0 ? (
								<div className="py-12 text-center text-muted-foreground">
									<Sparkles className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
									<p className="text-sm font-medium text-foreground">Agenda despejada para hoy</p>
									<p className="mt-1 font-mono text-xs text-muted-foreground">
										No hay citas ni tareas programadas con vencimiento hoy.
									</p>
								</div>
							) : (
								<div className="mt-4 divide-y">
									{appointments.length > 0 && (
										<div className="py-3 first:pt-0">
											<p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-sky-400">
												Citas Agendadas ({appointments.length})
											</p>
											<ul className="space-y-2">
												{appointments.map((item, idx) => (
													<li
														key={`cita-${idx}`}
														className="flex items-center justify-between border bg-muted/60 p-2.5"
													>
														<div>
															<Link href={item.href} className="text-xs font-semibold text-foreground hover:underline">
																{item.label}
															</Link>
															<p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.sublabel}</p>
														</div>
														<Badge variant="outline" className="font-mono text-[11px] text-sky-400">
															{new Intl.DateTimeFormat('es', { timeZone, timeStyle: 'short' }).format(new Date(item.date))}
														</Badge>
													</li>
												))}
											</ul>
										</div>
									)}

									{tasks.length > 0 && (
										<div className="py-3 first:pt-0">
											<p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-amber-400">
												Tareas con Vencimiento Hoy ({tasks.length})
											</p>
											<ul className="space-y-2">
												{tasks.map((item, idx) => (
													<li
														key={`task-${idx}`}
														className="flex items-center justify-between bg-muted/60 p-2.5"
													>
														<div className="flex min-w-0 items-center gap-2.5 pr-2">
															{context.canEdit && item.id && (
																<form action={changeTaskStatusAction}>
																	<input type="hidden" name="id" value={item.id} />
																	<input type="hidden" name="status" value="completada" />
																	<Button
																		type="submit"
																		variant="outline"
																		size="icon"
																		title="Marcar como completada"
																		className="h-4 w-4 rounded-none border-border bg-transparent text-transparent hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-300"
																	>
																		<Check size={11} />
																	</Button>
																</form>
															)}
															<div className="truncate">
																<Link href={item.href} className="block truncate text-xs font-semibold text-foreground hover:underline">
																	{item.label}
																</Link>
																<p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{item.sublabel}</p>
															</div>
														</div>
														<Link
															href={item.href}
															className="shrink-0 font-mono text-xs text-muted-foreground hover:text-foreground"
														>
															Ver tarea →
														</Link>
													</li>
												))}
											</ul>
										</div>
									)}

									{payments.length > 0 && (
										<div className="py-3 first:pt-0">
											<p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-emerald-400">
												Cobros del Día ({payments.length})
											</p>
											<ul className="space-y-2">
												{payments.map((item, idx) => (
													<li
														key={`pay-${idx}`}
														className="flex items-center justify-between border bg-muted/60 p-2.5"
													>
														<div>
															<Link href={item.href} className="text-xs font-semibold text-foreground hover:underline">
																{item.label}
															</Link>
															<p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.sublabel}</p>
														</div>
														<Link
															href={item.href}
															className="font-mono text-xs text-emerald-400 hover:text-emerald-300"
														>
															Cobrar →
														</Link>
													</li>
												))}
											</ul>
										</div>
									)}
								</div>
							)}
						</CardContent>
					</Card>
				</div>

				{/* Seguimientos Proactivos (WhatsApp) */}
				<div className="space-y-4">
					<Card className="gap-0 py-5">
						<CardHeader className="flex flex-row items-center justify-between gap-2 border-b px-5 pb-3">
							<CardTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider">
								<MessageCircle className="h-4 w-4 text-[#25d366]" />
								Seguimientos Comerciales (WhatsApp)
							</CardTitle>
							<span className="font-mono text-xs text-muted-foreground">
								{followups.length} {followups.length === 1 ? 'pendiente' : 'pendientes'}
							</span>
						</CardHeader>
						<CardContent className="mt-2">
							{followups.length === 0 ? (
								<div className="py-12 text-center text-muted-foreground">
									<CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
									<p className="text-sm font-medium text-foreground">Al día con todos los contactos</p>
									<p className="mt-1 font-mono text-xs text-muted-foreground">
										Ningún lead o cliente ha sobrepasado su SLA de seguimiento sin respuesta.
									</p>
								</div>
							) : (
								<FollowupsTriage items={followups} canEdit={context.canEdit} assignees={assignees} />
							)}
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	)
}
