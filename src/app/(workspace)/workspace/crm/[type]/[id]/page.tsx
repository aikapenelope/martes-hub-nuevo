/**
 * CrmRecordPage — `/workspace/crm/[type]/[id]`. Ficha 360 de un lead o
 * cliente: datos de contacto, edición, timeline de actividades y conversión
 * lead→cliente, con la misma UI Storelink del resto del workspace.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  CircleDot,
  Clock,
  DollarSign,
  FileText,
  Flame,
  Globe,
  Layers,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react'

import {
  convertLeadAction,
  createActivityAction,
  updateClientAction,
  updateCompanyAction,
  updateLeadAction,
} from '@/lib/crm-actions'
import { cancelSequenceEnrollmentAction, enrollLeadInSequenceAction } from '@/lib/sequence-actions'
import { findAllPages } from '@/lib/lead-scoring'
import { getCrmRecord, type CrmView } from '@/lib/crm-data'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { TaskCreateDialog } from '@/components/workspace/TaskCreateDialog'
import { ActivityDrawer } from '@/components/workspace/ActivityDrawer'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getAssignableUsers } from '@/lib/tasks-data'
import { changeTaskStatusAction } from '@/lib/tasks-actions'
import { computeDealVelocity, computeWindowState, formatTimeAgo } from '@/lib/crm-pipeline-window'
import { cn } from '@/lib/utils'
import type { Client, Company, Lead, Segment, User } from '@/payload-types'

function relationName(value: number | Segment | User | Company | null | undefined): string {
  if (!value || typeof value === 'number') return 'Sin asignar'
  if ('name' in value && typeof value.name === 'string') return value.name
  if ('firstName' in value && typeof value.firstName === 'string') {
    return `${value.firstName} ${value.lastName ?? ''}`.trim()
  }
  if ('email' in value && typeof value.email === 'string') return value.email
  return 'Sin asignar'
}

function relId(value: number | { id: number } | null | undefined): number | null {
  if (value == null) return null
  return typeof value === 'object' ? value.id : value
}

/* Inputs, selects y textareas NATIVOS con tokens Shadcn alineados a OLED */
const inputCls =
  'w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 font-sans'
const labelCls = 'flex flex-col gap-1.5 text-xs font-medium text-muted-foreground'

const priorityCls: Record<string, string> = {
  baja: 'bg-muted/60 text-muted-foreground border-border/60',
  media: 'bg-muted/80 text-foreground/80 border-border/60',
  alta: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  urgente: 'bg-destructive/10 text-destructive border-destructive/30',
}

const submitBtnCls =
  'self-start rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition-opacity hover:opacity-90'

export default async function CrmRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>
  searchParams: Promise<{ created?: string; updated?: string; converted?: string; taskCreated?: string; sequenceError?: string }>
}) {
  const { type: rawType, id: rawId } = await params
  const feedback = await searchParams
  if (rawType !== 'leads' && rawType !== 'clientes' && rawType !== 'empresas') notFound()
  const id = Number(rawId)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const type = rawType as CrmView
  const context = await getWorkspaceContext()
  const detail = await getCrmRecord({
    payload: context.payload,
    user: context.user,
    tenantId: context.tenantId,
    type,
    id,
  })
  if (!detail) notFound()

  const [companiesRes, segmentsRes, agentsRes, assignees, clientsRes, leadsRes] = await Promise.all([
    context.payload.find({
      collection: 'companies',
      where: { tenant: { equals: context.tenantId } },
      depth: 0,
      limit: 200,
      sort: 'name',
      overrideAccess: false,
      user: context.user,
    }),
    context.payload.find({
      collection: 'segments',
      where: { tenant: { equals: context.tenantId } },
      depth: 0,
      limit: 200,
      sort: 'name',
      overrideAccess: false,
      user: context.user,
    }),
    context.payload.find({
      collection: 'users',
      where: { and: [{ roles: { in: ['admin', 'agente'] } }, { active: { equals: true } }] },
      depth: 0,
      limit: 100,
      overrideAccess: false,
      user: context.user,
    }),
    getAssignableUsers({
      payload: context.payload,
      user: context.user,
      tenantId: context.tenantId,
    }),
    context.payload.find({
      collection: 'clients',
      where: { tenant: { equals: context.tenantId } },
      depth: 0,
      limit: 100,
      sort: 'name',
      overrideAccess: false,
      user: context.user,
    }),
    context.payload.find({
      collection: 'leads',
      where: { tenant: { equals: context.tenantId } },
      depth: 0,
      limit: 100,
      sort: 'fullName',
      overrideAccess: false,
      user: context.user,
    }),
  ])

  const availableCompanies = companiesRes.docs as Company[]
  const availableSegments = segmentsRes.docs as Segment[]
  const availableAgents = agentsRes.docs as User[]
  const clientOptions = clientsRes.docs as Client[]
  const leadOptions = leadsRes.docs as Lead[]

  // Secuencias (solo ficha de lead): activas del tenant + inscripciones del lead.
  interface SequenceOption {
    id: number
    name: string
  }
  interface EnrollmentRow {
    id: number
    status: string
    currentStep: number
    sequence: number | { id: number; name: string }
  }
  let activeSequences: SequenceOption[] = []
  let leadEnrollments: EnrollmentRow[] = []

  const isLead = type === 'leads'
  const isCompany = type === 'empresas'
  const isClient = type === 'clientes'

  const leadRecord = isLead ? detail.lead! : null
  const clientRecord = isClient ? detail.client! : null
  const companyRecord = isCompany ? detail.company! : null

  if (isLead) {
    // Paginado completo en ambas lecturas — un límite fijo dejaría secuencias
    // fuera del selector (hallazgo Devin #104-4) y, peor, inscripciones
    // ACTIVAS sin control de cancelación (hallazgo Devin #104-6). El
    // historial no activo sí se acota a las 10 más recientes.
    const [sequencesDocs, activeEnrollmentsDocs, historyEnrollmentsDocs] = await Promise.all([
      findAllPages((page) =>
        context.payload.find({
          collection: 'sequences',
          where: {
            and: [{ tenant: { equals: context.tenantId } }, { active: { equals: true } }],
          },
          limit: 500,
          page,
          depth: 0,
          sort: 'name',
          select: { name: true },
          overrideAccess: false,
          user: context.user,
        }),
      ),
      findAllPages((page) =>
        context.payload.find({
          collection: 'sequence-enrollments',
          where: {
            and: [
              { tenant: { equals: context.tenantId } },
              { lead: { equals: id } },
              { status: { equals: 'activa' } },
            ],
          },
          limit: 100,
          page,
          depth: 1,
          sort: 'createdAt',
          overrideAccess: false,
          user: context.user,
        }),
      ),
      context.payload.find({
        collection: 'sequence-enrollments',
        where: {
          and: [
            { tenant: { equals: context.tenantId } },
            { lead: { equals: id } },
            { status: { in: ['completada', 'cancelada', 'respondida'] } },
          ],
        },
        limit: 10,
        depth: 1,
        sort: '-createdAt',
        overrideAccess: false,
        user: context.user,
      }),
    ])
    activeSequences = sequencesDocs.map((s) => ({ id: s.id, name: s.name }))
    leadEnrollments = [...activeEnrollmentsDocs, ...historyEnrollmentsDocs.docs].map((e) => ({
      id: e.id,
      status: e.status,
      currentStep: e.currentStep ?? 0,
      sequence:
        typeof e.sequence === 'object'
          ? { id: e.sequence.id, name: (e.sequence as { name?: string }).name ?? `#${e.sequence.id}` }
          : e.sequence,
    }))
  }

  if (clientRecord && !clientOptions.some((c) => c.id === clientRecord.id)) {
    clientOptions.unshift(clientRecord)
  }
  if (leadRecord && !leadOptions.some((l) => l.id === leadRecord.id)) {
    leadOptions.unshift(leadRecord)
  }

  const name = isLead
    ? leadRecord?.fullName ?? ''
    : isCompany
      ? companyRecord?.name ?? ''
      : clientRecord?.name ?? ''

  const email = isLead ? leadRecord?.email : isCompany ? companyRecord?.email : clientRecord?.email
  const phone = isLead ? leadRecord?.phone : isCompany ? companyRecord?.phone : clientRecord?.phone

  const convertedId =
    isLead && leadRecord?.convertedClient
      ? typeof leadRecord.convertedClient === 'number'
        ? leadRecord.convertedClient
        : leadRecord.convertedClient.id
      : undefined

  const recordSegment = isLead ? leadRecord?.segment : isCompany ? companyRecord?.segment : clientRecord?.segment
  const currentCompanyId = isLead
    ? relId(leadRecord?.company)
    : isClient
      ? relId(clientRecord?.company)
      : null
  const currentSegmentId = relId(recordSegment)
  const currentAgentId = isLead
    ? relId(leadRecord?.assignedTo)
    : isCompany
      ? relId(companyRecord?.assignedAgent)
      : relId(clientRecord?.assignedAgent)

  // Garantizar que las entidades actualmente asignadas nunca se omitan si caen fuera del límite
  if (currentCompanyId && !availableCompanies.some((c) => c.id === currentCompanyId)) {
    try {
      const missingCompany = await context.payload.findByID({
        collection: 'companies',
        id: currentCompanyId,
        depth: 0,
        overrideAccess: true,
      })
      if (missingCompany && missingCompany.tenant === context.tenantId) {
        availableCompanies.unshift(missingCompany as Company)
      }
    } catch {
      // Ignorar si ya no existe
    }
  }

  if (currentSegmentId && !availableSegments.some((s) => s.id === currentSegmentId)) {
    try {
      const missingSegment = await context.payload.findByID({
        collection: 'segments',
        id: currentSegmentId,
        depth: 0,
        overrideAccess: true,
      })
      if (missingSegment && missingSegment.tenant === context.tenantId) {
        availableSegments.unshift(missingSegment as Segment)
      }
    } catch {
      // Ignorar si ya no existe
    }
  }

  if (currentAgentId && !availableAgents.some((a) => a.id === currentAgentId)) {
    try {
      const missingAgent = await context.payload.findByID({
        collection: 'users',
        id: currentAgentId,
        depth: 0,
        overrideAccess: true,
      })
      // Misma regla que validateTenantAgent (crm-actions): el agente debe
      // pertenecer al tenant activo o ser admin global. Sin este check —que
      // sí tienen los fallbacks de company y segment— un ID adivinado filtraba
      // el nombre de un usuario de otro tenant en el dropdown.
      const agentTenants = (missingAgent?.tenants || []).map((t) =>
        typeof t.tenant === 'object' && t.tenant ? t.tenant.id : t.tenant,
      )
      const isTenantAgent =
        agentTenants.includes(context.tenantId) || Boolean(missingAgent?.roles?.includes('admin'))
      if (missingAgent && isTenantAgent) {
        availableAgents.unshift(missingAgent as User)
      }
    } catch {
      // Ignorar si ya no existe
    }
  }

  // Métricas 360° del Contacto
  const lastActivityIso =
    detail.timeline[0]?.date ||
    (isLead ? leadRecord?.updatedAt : isClient ? clientRecord?.updatedAt : companyRecord?.updatedAt) ||
    new Date().toISOString()
  const dealVelocity = computeDealVelocity(lastActivityIso)

  // Conversación y ventana SLA de WhatsApp Meta
  const mainConv = detail.conversations[0]
  const windowState = mainConv
    ? computeWindowState(mainConv.lastInboundAt, mainConv.lastMessageAt)
    : null

  // Iniciales para el avatar
  const initials =
    (name || 'ID')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || (isCompany ? 'EM' : isLead ? 'LD' : 'CL')

  // Total cobrado / LTV
  const totalBilled = detail.timeline
    .filter((t) => t.kind === 'cobro' && t.detail?.includes('pagado'))
    .reduce((acc, t) => {
      const match = t.detail?.match(/\$([0-9.]+)/)
      return acc + (match ? Number(match[1]) : 0)
    }, 0)

  const pendingTasksCount = detail.tasks.filter(
    (t) => t.status !== 'completada' && t.status !== 'cancelada',
  ).length

  return (
    <div className="space-y-4">
      <Link href={`/workspace/crm?vista=${type}`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-sans">
        <ArrowLeft className="size-3.5" aria-hidden="true" /> Volver al CRM
      </Link>

      {(feedback.created || feedback.updated || feedback.converted || feedback.taskCreated) && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-400 font-medium shadow-xs" role="status">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-400" aria-hidden="true" />
          <span>
            {feedback.taskCreated
              ? 'Tarea creada correctamente.'
              : feedback.created
              ? 'Registro creado correctamente.'
              : feedback.updated
              ? 'Cambios guardados.'
              : 'Lead convertido a cliente exitosamente.'}
          </span>
        </div>
      )}

      {/* Hero Header 360° Moderno */}
      <header className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card/60 backdrop-blur-xs p-5 shadow-xs sm:flex-row sm:items-center">
        <div className="flex items-center gap-3.5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60 text-foreground font-mono font-bold text-sm tracking-wider">
            {initials}
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className="text-[10px] font-mono uppercase">
                {isLead ? 'Lead' : isCompany ? 'Empresa' : 'Cliente'} · #{id}
              </Badge>
              {isLead && leadRecord?.status && (
                <Badge variant="secondary" className="text-[10px] capitalize font-medium">
                  {leadRecord.status}
                </Badge>
              )}
              {isClient && clientRecord?.stage && (
                <Badge variant="secondary" className="text-[10px] capitalize font-medium">
                  {clientRecord.stage}
                </Badge>
              )}
              {isLead && leadRecord?.source && (
                <Badge variant="outline" className="text-[10px] font-mono capitalize">
                  {leadRecord.source.replace('_', ' ')}
                </Badge>
              )}
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>{relationName(recordSegment)}</span>
              {isLead && leadRecord?.estimatedValue != null && leadRecord.estimatedValue > 0 && (
                <span className="font-mono text-emerald-400 font-semibold tabular-nums">
                  · Valor: ${leadRecord.estimatedValue.toLocaleString('en-US')}
                </span>
              )}
              {isCompany && companyRecord?.taxId && (
                <span className="font-mono text-muted-foreground">· RIF: {companyRecord.taxId}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {detail.conversations.length > 0 && (
            <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5 font-medium">
              <Link href={`/workspace/inbox?c=${detail.conversations[0].id}`}>
                <MessageCircle className="size-3.5" />
                <span>Abrir en inbox</span>
              </Link>
            </Button>
          )}
          {phone && (
            <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5 font-medium border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300">
              <a
                href={`https://wa.me/${phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="size-3.5 text-[#25d366]" />
                <span>WhatsApp</span>
              </a>
            </Button>
          )}
          {!isCompany && context.canEdit && (
            <>
              <TaskCreateDialog
                assignees={assignees}
                clients={clientOptions}
                leads={leadOptions}
                variant="secondary"
                defaultClientId={isClient ? id : undefined}
                defaultLeadId={isLead ? id : undefined}
                redirectTo={`/workspace/crm/${type}/${id}?taskCreated=1`}
              />
              <ActivityDrawer
                clientId={isClient ? id : undefined}
                leadId={isLead ? id : undefined}
                redirectTo={`/workspace/crm/${type}/${id}`}
                variant="ghost"
              />
            </>
          )}
          {convertedId && (
            <Button asChild size="sm" className="h-8 text-xs font-semibold">
              <Link href={`/workspace/crm/clientes/${convertedId}`}>
                Ver cliente
              </Link>
            </Button>
          )}
        </div>
      </header>

      {/* Bento 360° KPI Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* KPI 1: Etapa en Pipeline */}
        <Card className="rounded-xl border border-border bg-card/60 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Etapa Pipeline</span>
            <Layers className="size-3.5 text-sky-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-lg font-bold tracking-tight text-foreground capitalize">
              {isLead ? leadRecord?.status : isClient ? clientRecord?.stage : 'Activa'}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground truncate">
            Activo {formatTimeAgo(lastActivityIso)}
          </p>
        </Card>

        {/* KPI 2: Valor Comercial / Oportunidad */}
        <Card className="rounded-xl border border-border bg-card/60 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              {isLead ? 'Oportunidad (Deal)' : 'Facturación Acumulada'}
            </span>
            <DollarSign className="size-3.5 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5 font-mono">
            <span className="text-lg font-bold tracking-tight text-foreground tabular-nums">
              {isLead
                ? (leadRecord?.estimatedValue != null && leadRecord.estimatedValue > 0
                    ? `$${leadRecord.estimatedValue.toLocaleString('en-US')}`
                    : '—')
                : (totalBilled > 0
                    ? `$${totalBilled.toLocaleString('en-US')}`
                    : '—')}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground truncate">
            {isLead ? 'Valor proyectado de cierre' : `${detail.timeline.filter((t) => t.kind === 'cobro').length} cobros registrados`}
          </p>
        </Card>

        {/* KPI 3: Velocidad y Temperatura */}
        <Card className="rounded-xl border border-border bg-card/60 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Temperatura</span>
            <Flame className={cn("size-3.5", dealVelocity.temperature === 'hot' ? 'text-rose-400' : dealVelocity.temperature === 'warm' ? 'text-amber-400' : 'text-zinc-500')} />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className={cn(
              "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold font-mono uppercase",
              dealVelocity.temperature === 'hot'
                ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                : dealVelocity.temperature === 'warm'
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                : "bg-muted text-muted-foreground border border-border"
            )}>
              {dealVelocity.temperature === 'hot' ? '🔥 Fresco' : dealVelocity.temperature === 'warm' ? '⚡ Tibio' : '❄ En Riesgo'}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground truncate">
            {dealVelocity.label}
          </p>
        </Card>

        {/* KPI 4: Ventana SLA WhatsApp */}
        <Card className="rounded-xl border border-border bg-card/60 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">WhatsApp Meta SLA</span>
            <MessageCircle className="size-3.5 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            {mainConv && windowState ? (
              windowState.needsReply ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold font-mono bg-rose-500/10 text-rose-400 border border-rose-500/30">
                  ⚠ Por responder
                </span>
              ) : windowState.windowMinutesRemaining != null && windowState.windowMinutesRemaining > 0 ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {Math.floor(windowState.windowMinutesRemaining / 60)}h restantes
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold font-mono bg-muted text-muted-foreground border border-border">
                  Expirada
                </span>
              )
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold font-mono bg-muted text-muted-foreground border border-border">
                {phone ? 'Disponible' : 'Sin chat'}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground truncate">
            {mainConv ? `${mainConv.contactAddress} · ${mainConv.status}` : phone ? phone : 'Sin número conectado'}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_.9fr]">
        <div className="space-y-4">
          <Tabs defaultValue="ficha" className="space-y-4">
            <TabsList className="bg-muted/40 border border-border/80 p-1 rounded-xl h-auto flex flex-wrap gap-1">
              <TabsTrigger
                value="ficha"
                className="text-xs data-[state=active]:bg-card data-[state=active]:text-foreground rounded-lg py-1.5 px-3 flex items-center gap-1.5 font-medium"
              >
                <UserRound className="size-3.5" />
                <span>{isCompany ? 'Datos de Empresa' : 'Ficha y Edición'}</span>
              </TabsTrigger>
              <TabsTrigger
                value="tareas"
                className="text-xs data-[state=active]:bg-card data-[state=active]:text-foreground rounded-lg py-1.5 px-3 flex items-center gap-1.5 font-medium"
              >
                <CheckSquare className="size-3.5" />
                <span>Tareas ({pendingTasksCount})</span>
              </TabsTrigger>
              {isCompany && (
                <TabsTrigger
                  value="contactos"
                  className="text-xs data-[state=active]:bg-card data-[state=active]:text-foreground rounded-lg py-1.5 px-3 flex items-center gap-1.5 font-medium"
                >
                  <Users className="size-3.5" />
                  <span>Contactos ({(detail.relatedClients?.length || 0) + (detail.relatedLeads?.length || 0)})</span>
                </TabsTrigger>
              )}
              {isLead && (
                <TabsTrigger
                  value="secuencias"
                  className="text-xs data-[state=active]:bg-card data-[state=active]:text-foreground rounded-lg py-1.5 px-3 flex items-center gap-1.5 font-medium"
                >
                  <Mail className="size-3.5" />
                  <span>Secuencias ({leadEnrollments.length})</span>
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="ficha" className="space-y-4 m-0">
              <Card className="rounded-xl border border-border/70 bg-card shadow-xs">
            <CardHeader className="border-b border-border/60 p-5">
              <CardTitle className="text-base font-bold text-foreground">
                {isCompany ? 'Ficha de la Empresa' : 'Ficha 360°'}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Datos comerciales, estado y contexto interno.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5">

            <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
              <div>
                <dt className="flex items-center gap-1.5 text-muted-foreground font-mono uppercase">
                  <Mail className="w-3.5 h-3.5" aria-hidden="true" /> Email
                </dt>
                <dd className="mt-1 text-foreground">
                  {email ? <a href={`mailto:${email}`}>{email}</a> : 'Sin email'}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1.5 text-muted-foreground font-mono uppercase">
                  <Phone className="w-3.5 h-3.5" aria-hidden="true" /> Teléfono
                </dt>
                <dd className="mt-1 text-foreground">
                  {phone ? <a href={`tel:${phone}`}>{phone}</a> : 'Sin teléfono'}
                </dd>
              </div>
              {isCompany ? (
                <>
                  <div>
                    <dt className="flex items-center gap-1.5 text-muted-foreground font-mono uppercase">
                      <Globe className="w-3.5 h-3.5" aria-hidden="true" /> Sitio Web
                    </dt>
                    <dd className="mt-1 text-foreground">
                      {companyRecord?.website ? (
                        <a href={companyRecord.website} target="_blank" rel="noreferrer" className="underline">
                          {companyRecord.website}
                        </a>
                      ) : (
                        'Sin sitio web'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1.5 text-muted-foreground font-mono uppercase">
                      <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> Ubicación
                    </dt>
                    <dd className="mt-1 text-foreground">
                      {companyRecord?.city ? `${companyRecord.city}${companyRecord.state ? `, ${companyRecord.state}` : ''}` : 'Sin ciudad'}
                    </dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt className="flex items-center gap-1.5 text-muted-foreground font-mono uppercase">
                      <CircleDot className="w-3.5 h-3.5" aria-hidden="true" /> Estado
                    </dt>
                    <dd className="mt-1 text-foreground">
                      {isLead ? leadRecord?.status : clientRecord?.stage}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground font-mono uppercase">
                      {isLead ? 'Empresa vinculada' : 'Agente'}
                    </dt>
                    <dd className="mt-1 text-foreground">
                      {isLead
                        ? relationName(leadRecord?.company)
                        : relationName(clientRecord?.assignedAgent)}
                    </dd>
                  </div>
                </>
              )}
            </dl>

            {context.canEdit ? (
              <form
                action={
                  isCompany
                    ? updateCompanyAction
                    : isLead
                      ? updateLeadAction
                      : updateClientAction
                }
                className="mt-5 flex flex-col gap-3"
              >
                <input name="id" type="hidden" value={id} />

                {/* Nombre de la entidad */}
                <label className={labelCls}>
                  {isCompany ? 'Nombre de la empresa' : isLead ? 'Nombre completo' : 'Nombre del contacto'}
                  <input
                    name={isLead ? 'fullName' : 'name'}
                    defaultValue={name}
                    maxLength={160}
                    required
                    className={inputCls}
                  />
                </label>

                {/* Email y Teléfono */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={labelCls}>
                    Email
                    <input
                      name="email"
                      type="email"
                      defaultValue={email ?? ''}
                      maxLength={240}
                      className={inputCls}
                    />
                  </label>
                  <label className={labelCls}>
                    Teléfono
                    <input
                      name="phone"
                      type="tel"
                      defaultValue={phone ?? ''}
                      maxLength={80}
                      className={inputCls}
                    />
                  </label>
                </div>

                {isCompany && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelCls}>
                        RIF / CIF / Identificador Fiscal
                        <input
                          name="taxId"
                          defaultValue={companyRecord?.taxId ?? ''}
                          maxLength={50}
                          className={inputCls}
                        />
                      </label>
                      <label className={labelCls}>
                        Sitio Web
                        <input
                          name="website"
                          type="url"
                          defaultValue={companyRecord?.website ?? ''}
                          maxLength={255}
                          className={inputCls}
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelCls}>
                        Ciudad
                        <input
                          name="city"
                          defaultValue={companyRecord?.city ?? ''}
                          maxLength={100}
                          className={inputCls}
                        />
                      </label>
                      <label className={labelCls}>
                        Estado / Región
                        <input
                          name="state"
                          defaultValue={companyRecord?.state ?? ''}
                          maxLength={100}
                          className={inputCls}
                        />
                      </label>
                    </div>

                    <label className={labelCls}>
                      Dirección física / Local
                      <input
                        name="address"
                        defaultValue={companyRecord?.address ?? ''}
                        maxLength={255}
                        className={inputCls}
                      />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelCls}>
                        Segmento / Rubro
                        <select
                          name="segment"
                          defaultValue={relId(companyRecord?.segment) ?? ''}
                          className={inputCls}
                        >
                          <option value="">Sin segmento</option>
                          {availableSegments.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={labelCls}>
                        Agente asignado
                        <select
                          name="assignedAgent"
                          defaultValue={relId(companyRecord?.assignedAgent) ?? ''}
                          className={inputCls}
                        >
                          <option value="">Sin agente</option>
                          {availableAgents.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.firstName ? `${a.firstName} ${a.lastName ?? ''}`.trim() : a.email}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </>
                )}

                {!isCompany && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelCls}>
                        Empresa (Cuenta)
                        <select
                          name="company"
                          defaultValue={currentCompanyId ?? ''}
                          className={inputCls}
                        >
                          <option value="">Sin empresa vinculada</option>
                          {availableCompanies.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={labelCls}>
                        {isLead ? 'Cargo / Posición' : 'Nombre de empresa (texto)'}
                        <input
                          name={isLead ? 'position' : 'companyName'}
                          defaultValue={
                            isLead ? leadRecord?.position ?? '' : clientRecord?.companyName ?? ''
                          }
                          className={inputCls}
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelCls}>
                        {isLead ? 'Estado' : 'Etapa'}
                        {isLead ? (
                          <select
                            name="status"
                            defaultValue={leadRecord?.status ?? 'nuevo'}
                            className={inputCls}
                          >
                            <option value="nuevo">Nuevo</option>
                            <option value="contactado">Contactado</option>
                            <option value="calificado">Calificado</option>
                            <option value="descartado">Descartado</option>
                          </select>
                        ) : (
                          <select
                            name="stage"
                            defaultValue={clientRecord?.stage ?? 'nuevo'}
                            className={inputCls}
                          >
                            <option value="nuevo">Nuevo</option>
                            <option value="activo">Activo</option>
                            <option value="inactivo">Inactivo</option>
                            <option value="perdido">Perdido</option>
                          </select>
                        )}
                      </label>

                      <label className={labelCls}>
                        Rubro / Segmento
                        <select
                          name="segment"
                          defaultValue={relId(recordSegment) ?? ''}
                          className={inputCls}
                        >
                          <option value="">Sin segmento</option>
                          {availableSegments.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {isLead && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className={labelCls}>
                          Canal de origen
                          <select
                            name="source"
                            defaultValue={leadRecord?.source ?? 'manual'}
                            className={inputCls}
                          >
                            <option value="manual">Manual</option>
                            <option value="google_maps">Google Maps / Local</option>
                            <option value="puerta_fria">Puerta Fría / En Persona</option>
                            <option value="whatsapp">WhatsApp Directo</option>
                            <option value="instagram_dm">Instagram DM</option>
                            <option value="linkedin">LinkedIn</option>
                            <option value="tally">Formulario Web / Tally</option>
                            <option value="apify">Apify Scraper</option>
                            <option value="referido">Referido</option>
                          </select>
                        </label>

                        <label className={labelCls}>
                          Valor estimado (USD)
                          <input
                            name="estimatedValue"
                            type="number"
                            step="1"
                            defaultValue={leadRecord?.estimatedValue ?? ''}
                            placeholder="Ej: 1500"
                            className={inputCls}
                          />
                        </label>
                      </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={labelCls}>
                        Agente asignado
                        <select
                          name={isLead ? 'assignedTo' : 'assignedAgent'}
                          defaultValue={
                            relId(isLead ? leadRecord?.assignedTo : clientRecord?.assignedAgent) ?? ''
                          }
                          className={inputCls}
                        >
                          <option value="">Sin asignar</option>
                          {availableAgents.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.firstName ? `${a.firstName} ${a.lastName ?? ''}`.trim() : a.email}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className={labelCls}>
                        Ciudad
                        <input
                          name="city"
                          defaultValue={(isLead ? leadRecord?.city : clientRecord?.city) ?? ''}
                          className={inputCls}
                        />
                      </label>
                    </div>

                    {isClient && (
                      <label className="flex items-center gap-2 text-xs text-foreground/80">
                        <input
                          name="consent"
                          type="checkbox"
                          defaultChecked={Boolean(clientRecord?.consent)}
                        />{' '}
                        Consentimiento de contacto
                      </label>
                    )}
                  </>
                )}

                <label className={labelCls}>
                  Comentarios comerciales
                  <textarea
                    name="commercialNotes"
                    rows={3}
                    maxLength={4000}
                    defaultValue={
                      (isLead
                        ? leadRecord?.commercialNotes
                        : isCompany
                          ? companyRecord?.commercialNotes
                          : clientRecord?.commercialNotes) ?? ''
                    }
                    placeholder="Estrategia de cierre, objeciones principales o notas de negociación..."
                    className={inputCls}
                  />
                </label>

                <label className={labelCls}>
                  Notas internas
                  <textarea
                    name="notes"
                    rows={3}
                    maxLength={4000}
                    defaultValue={
                      (isLead ? leadRecord?.notes : isCompany ? companyRecord?.notes : clientRecord?.notes) ?? ''
                    }
                    className={inputCls}
                  />
                </label>

                <Button type="submit" className={submitBtnCls}>
                  Guardar cambios
                </Button>
              </form>
            ) : (
              <div className="mt-5 border border-border bg-background p-3 text-xs text-foreground/80">
                <strong className="text-foreground">Notas internas</strong>
                <p className="mt-1">
                  {(isLead ? leadRecord?.notes : isCompany ? companyRecord?.notes : clientRecord?.notes) ||
                    'Sin notas registradas.'}
                </p>
              </div>
            )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Si es una empresa, mostrar sus contactos asociados (Leads y Clientes) */}
        {isCompany && (
          <TabsContent value="contactos" className="space-y-4 m-0">
            <Card className="rounded-xl border border-border/70 bg-card shadow-xs">
              <CardHeader className="border-b border-border/60 p-5">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" />
                  <CardTitle className="text-base font-bold text-foreground">Contactos asociados</CardTitle>
                </div>
                <CardDescription className="text-xs text-muted-foreground">
                  Personas registradas en el CRM vinculadas a esta empresa.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                      Clientes ({detail.relatedClients?.length ?? 0})
                    </h3>
                    {(!detail.relatedClients || detail.relatedClients.length === 0) ? (
                      <p className="text-xs text-muted-foreground">Ningún cliente activo vinculado.</p>
                    ) : (
                      <ul className="divide-y divide-border/60 rounded-lg border border-border/60 overflow-hidden">
                        {detail.relatedClients.map((c) => (
                          <li key={c.id} className="flex items-center justify-between p-3 text-xs hover:bg-muted/30 transition-colors">
                            <div>
                              <Link
                                href={`/workspace/crm/clientes/${c.id}`}
                                className="font-semibold text-foreground hover:underline"
                              >
                                {c.name}
                              </Link>
                              <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">
                                {c.email || c.phone || 'Sin datos de contacto'} · Etapa: {c.stage}
                              </span>
                            </div>
                            <Button asChild variant="ghost" size="xs" className="h-7 text-xs font-medium text-sky-400 hover:text-sky-300">
                              <Link href={`/workspace/crm/clientes/${c.id}`}>
                                Ver ficha →
                              </Link>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div>
                    <h3 className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                      Leads en prospección ({detail.relatedLeads?.length ?? 0})
                    </h3>
                    {(!detail.relatedLeads || detail.relatedLeads.length === 0) ? (
                      <p className="text-xs text-muted-foreground">Ningún prospecto vinculado.</p>
                    ) : (
                      <ul className="divide-y divide-border/60 rounded-lg border border-border/60 overflow-hidden">
                        {detail.relatedLeads.map((l) => (
                          <li key={l.id} className="flex items-center justify-between p-3 text-xs hover:bg-muted/30 transition-colors">
                            <div>
                              <Link
                                href={`/workspace/crm/leads/${l.id}`}
                                className="font-semibold text-foreground hover:underline"
                              >
                                {l.fullName}
                              </Link>
                              <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">
                                {l.email || l.phone || 'Sin datos de contacto'} · Estado: {l.status}
                              </span>
                            </div>
                            <Button asChild variant="ghost" size="xs" className="h-7 text-xs font-medium text-sky-400 hover:text-sky-300">
                              <Link href={`/workspace/crm/leads/${l.id}`}>
                                Ver ficha →
                              </Link>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Tareas y Compromisos asociados */}
        <TabsContent value="tareas" className="space-y-4 m-0">
          <Card className="rounded-xl border border-border/70 bg-card shadow-xs">
            <CardHeader className="border-b border-border/60 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 space-y-0">
              <div>
                <div className="flex items-center gap-2">
                  <CheckSquare className="size-4 text-muted-foreground" />
                  <CardTitle className="text-base font-bold text-foreground">Tareas y compromisos</CardTitle>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {detail.tasks.filter((t) => t.status !== 'completada' && t.status !== 'cancelada').length} pendientes
                  </Badge>
                </div>
                <CardDescription className="text-xs text-muted-foreground mt-1">
                  {isCompany
                    ? 'Tareas asignadas a los contactos vinculados con esta empresa.'
                    : 'Compromisos, recordatorios y acciones asignadas a este contacto.'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="ghost" size="xs" className="h-7 text-xs text-muted-foreground hover:text-foreground">
                  <Link href={`/workspace/tasks?${isLead ? 'lead' : isClient ? 'client' : ''}=${id}`}>
                    Ver en Tareas →
                  </Link>
                </Button>
                {context.canEdit && !isCompany && (
                  <TaskCreateDialog
                    assignees={assignees}
                    clients={clientOptions}
                    leads={leadOptions}
                    variant="secondary"
                    defaultClientId={isClient ? id : undefined}
                    defaultLeadId={isLead ? id : undefined}
                    redirectTo={`/workspace/crm/${type}/${id}?taskCreated=1`}
                  />
                )}
              </div>
            </CardHeader>
            <CardContent className="p-5">

            {detail.tasks.length === 0 ? (
              <div className="mt-4 border border-border bg-background/40 p-4 text-center">
                <p className="text-xs text-muted-foreground font-mono">No hay tareas asociadas a este registro.</p>
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-border border border-border">
                {detail.tasks.map((task) => {
                  const isDone = task.status === 'completada'
                  const isCanceled = task.status === 'cancelada'
                  const isOverdue = !isDone && !isCanceled && task.dueDate && new Date(task.dueDate) < new Date()
                  const assigneeName = relationName(task.assignedTo)

                  return (
                    <li
                      key={task.id}
                      className="flex items-center justify-between p-3 gap-3 bg-background/40 hover:bg-muted/30 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {context.canEdit && (
                          <form action={changeTaskStatusAction}>
                            <input type="hidden" name="id" value={task.id} />
                            <input type="hidden" name="status" value={isDone ? 'pendiente' : 'completada'} />
                            <Button
                              type="submit"
                              variant="outline"
                              size="icon"
                              title={isDone ? 'Reabrir tarea' : 'Marcar como completada'}
                              className={`h-4 w-4 rounded border p-0 transition shrink-0 ${
                                isDone
                                  ? 'border-emerald-500 bg-emerald-950 text-emerald-300'
                                  : 'border-border bg-background text-transparent hover:border-emerald-600 hover:text-emerald-300'
                              }`}
                            >
                              <Check size={11} />
                            </Button>
                          </form>
                        )}
                        <div className="min-w-0">
                          <Link
                            href={`/workspace/tasks/${task.id}`}
                            className={`text-xs font-medium block truncate hover:underline ${
                              isDone ? 'text-muted-foreground line-through' : 'text-foreground'
                            }`}
                          >
                            {task.title}
                          </Link>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] font-mono text-muted-foreground">
                            <span className={`px-1.5 py-0.5 border text-[9px] uppercase ${priorityCls[task.priority] ?? priorityCls.media}`}>
                              {task.priority}
                            </span>
                            <span>{task.status}</span>
                            {task.dueDate && (
                              <span className={isOverdue ? 'text-rose-400 font-bold' : 'text-muted-foreground'}>
                                {isOverdue ? '⚠ Vencida: ' : 'Vence: '}
                                {new Intl.DateTimeFormat('es', { dateStyle: 'short' }).format(new Date(task.dueDate))}
                              </span>
                            )}
                            {assigneeName !== 'Sin asignar' && (
                              <span className="text-muted-foreground">· {assigneeName}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <Link
                        href={`/workspace/tasks/${task.id}`}
                        className="text-xs text-muted-foreground hover:text-foreground font-mono shrink-0"
                      >
                        Ver →
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Secuencias de Email (si es lead) */}
        {isLead && (
          <TabsContent value="secuencias" className="space-y-4 m-0">
            <Card className="rounded-xl border border-border/70 bg-card shadow-xs">
              <CardHeader className="border-b border-border/60 p-5">
                <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  <Mail className="size-4 text-sky-400" />
                  <span>Secuencias de email automatizadas</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Automatizaciones de nutrición y seguimiento secuencial por correo.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {leadEnrollments.length > 0 ? (
                  <ul className="divide-y divide-border/60 rounded-xl border border-border/60 overflow-hidden">
                    {leadEnrollments.map((enrollment) => {
                      const seqName =
                        typeof enrollment.sequence === 'object'
                          ? enrollment.sequence.name
                          : `#${enrollment.sequence}`
                      return (
                        <li key={enrollment.id} className="flex items-center justify-between gap-3 p-3 text-xs bg-muted/20 hover:bg-muted/30 transition-colors">
                          <div className="min-w-0">
                            <span className="block truncate text-foreground font-semibold">{seqName}</span>
                            <span className="font-mono text-[10px] text-muted-foreground mt-0.5 block">
                              {enrollment.status === 'activa'
                                ? `activa · paso ${enrollment.currentStep + 1}`
                                : enrollment.status}
                            </span>
                          </div>
                          {context.canEdit && enrollment.status === 'activa' && (
                            <form action={cancelSequenceEnrollmentAction} className="shrink-0">
                              <input type="hidden" name="enrollmentId" value={enrollment.id} />
                              <input type="hidden" name="redirectTo" value={`/workspace/crm/leads/${id}`} />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="xs"
                                className="h-7 text-xs text-muted-foreground hover:text-rose-400"
                              >
                                Cancelar
                              </Button>
                            </form>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className="border border-border/60 bg-muted/20 rounded-xl p-4 text-center">
                    <p className="text-xs text-muted-foreground font-mono">No hay secuencias activas para este prospecto.</p>
                  </div>
                )}

                {context.canEdit && activeSequences.length > 0 && (
                  <form action={enrollLeadInSequenceAction} className="flex flex-col gap-2.5 pt-2">
                    <input type="hidden" name="leadId" value={id} />
                    <input type="hidden" name="redirectTo" value={`/workspace/crm/leads/${id}`} />
                    <label className={labelCls}>
                      Inscribir en nueva secuencia
                      <select name="sequenceId" required defaultValue="" className={inputCls}>
                        <option value="">Selecciona una secuencia…</option>
                        {activeSequences.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button type="submit" size="sm" className="self-start text-xs font-semibold">
                      Inscribir ahora
                    </Button>
                  </form>
                )}
                {feedback.sequenceError && (
                  <p className="text-xs text-rose-400 font-medium" role="alert">
                    {feedback.sequenceError}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>

    <aside className="space-y-4">
      {/* Timeline Unificado 360° con micro-tarjetas modernas */}
      <Card className="rounded-xl border border-border/70 bg-card shadow-xs">
        <CardHeader className="border-b border-border/60 p-4 sm:p-5 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-bold text-foreground">Timeline Unificado</CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px] font-mono">
            {detail.timeline.length} eventos
          </Badge>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          {detail.timeline.length === 0 ? (
            <p className="text-xs text-muted-foreground font-mono">Todavía no hay actividad registrada para este contacto.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {detail.timeline.map((entry, index) => {
                const IconComponent =
                  entry.kind === 'conversacion'
                    ? MessageCircle
                    : entry.kind === 'email_buzon' || entry.kind === 'email_enviado'
                    ? Mail
                    : entry.kind === 'cobro'
                    ? DollarSign
                    : entry.kind === 'cita'
                    ? Calendar
                    : entry.kind === 'tarea'
                    ? CheckSquare
                    : FileText

                const accentColor =
                  entry.kind === 'conversacion'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : entry.kind === 'cobro'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    : entry.kind === 'email_buzon' || entry.kind === 'email_enviado'
                    ? 'border-sky-500/30 bg-sky-500/10 text-sky-400'
                    : entry.kind === 'tarea'
                    ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-400'
                    : 'border-border bg-muted/60 text-muted-foreground'

                return (
                  <li key={`${entry.kind}-${index}-${entry.date}`} className="flex gap-2.5 group">
                    <div className={cn('size-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5', accentColor)}>
                      <IconComponent className="size-3.5" />
                    </div>
                    <div className="flex-1 min-w-0 bg-background/50 border border-border/60 rounded-xl p-2.5 hover:border-border transition-colors">
                      <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold">
                          {entry.kind.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {formatTimeAgo(entry.date)}
                        </span>
                      </div>
                      {entry.href ? (
                        <Link href={entry.href} className="text-xs font-semibold text-foreground hover:underline block truncate">
                          {entry.title}
                        </Link>
                      ) : (
                        <p className="text-xs font-semibold text-foreground block truncate">{entry.title}</p>
                      )}
                      {entry.detail && (
                        <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                          {entry.detail}
                        </p>
                      )}
                      <span className="text-[9px] font-mono text-zinc-500 mt-1 block">
                        {new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.date))}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {!isCompany && context.canEdit && (
        <Card className="rounded-xl border border-border/70 bg-card shadow-xs">
          <CardHeader className="border-b border-border/60 p-4">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
              <Plus className="size-3.5 text-primary" aria-hidden="true" />
              <span>Registrar actividad</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <form action={createActivityAction} className="flex flex-col gap-3">
              {isLead ? (
                <input type="hidden" name="lead" value={id} />
              ) : (
                <input type="hidden" name="client" value={id} />
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  Tipo
                  <select name="type" defaultValue="nota" className={inputCls}>
                    <option value="nota">Nota</option>
                    <option value="llamada">Llamada</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">Email</option>
                    <option value="reunion">Reunión</option>
                    <option value="otro">Otro</option>
                  </select>
                </label>
                <label className={labelCls}>
                  Fecha y hora
                  <input type="datetime-local" name="occurredAt" className={inputCls} />
                </label>
              </div>
              <label className={labelCls}>
                Resumen
                <textarea
                  name="summary"
                  rows={3}
                  maxLength={500}
                  placeholder="¿Qué ocurrió? Ej: Llamada de 15 min, acordamos enviar propuesta"
                  required
                  className={inputCls}
                />
              </label>
              <Button type="submit" size="sm" className="self-start text-xs font-semibold">
                Guardar actividad
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLead && context.canEdit && !convertedId && (
        <Card className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 shadow-xs">
          <CardContent className="p-4">
            <form action={convertLeadAction} className="flex flex-col gap-2">
              <input name="id" type="hidden" value={id} />
              <div className="flex items-center gap-1.5 text-xs text-foreground font-semibold">
                <Sparkles className="size-3.5 text-emerald-400" />
                <span>¿La oportunidad avanzó?</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Crea un cliente formal con estos datos y conserva todo el historial vinculado.
              </p>
              <Button type="submit" size="sm" className="mt-1 self-start text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white">
                Convertir a cliente
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </aside>
  </div>
</div>
)
}
