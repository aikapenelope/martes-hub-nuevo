import Link from 'next/link'
import { ArrowRight, CheckSquare2, CircleDollarSign, Clock3, Inbox, Plus, UsersRound } from 'lucide-react'

import { getOverviewData } from '@/lib/overview-data'
import { getWorkspaceContext } from '@/lib/workspace-context'

const currency = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const date = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short' })

export default async function OverviewPage() {
  const context = await getWorkspaceContext()
  const { kpis, tasks } = await getOverviewData(context)
  const firstName = context.user.firstName || context.user.email.split('@')[0]

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'

  const cards = [
    { label: 'Clientes activos', value: kpis.activeClients, note: `${kpis.openLeads} leads en pipeline`, icon: UsersRound },
    { label: 'Cobrado este mes', value: currency.format(kpis.collected), note: `${kpis.duePayments} cobros por gestionar`, icon: CircleDollarSign },
    { label: 'Conversaciones', value: kpis.conversations, note: `${kpis.staleConversations} requieren revisión`, icon: Inbox },
    { label: 'Tareas pendientes', value: kpis.pendingTasks, note: `${kpis.urgentTasks} de prioridad alta`, icon: CheckSquare2 },
  ]

  return (
    <div className="workspace-page">
      <section className="workspace-page-head">
        <div>
          <div className="workspace-eyebrow"><span className="workspace-eyebrow-dot" /> Operación en vivo</div>
          <h1 className="workspace-title">{greeting}, {firstName}</h1>
          <p className="workspace-subtitle">Lo importante de {context.tenant.name}, reunido en un solo lugar.</p>
        </div>
        {context.canEdit ? (
          <div className="workspace-actions">
            <Link className="workspace-button" href="/tasks"><Plus size={16} /> Nueva tarea</Link>
            <Link className="workspace-button workspace-button-primary" href="/crm"><Plus size={16} /> Nuevo lead</Link>
          </div>
        ) : null}
      </section>

      <section className="workspace-kpis" aria-label="Indicadores principales">
        {cards.map(({ label, value, note, icon: Icon }) => (
          <article className="workspace-card workspace-kpi" key={label}>
            <div className="workspace-kpi-top"><span className="workspace-kpi-label">{label}</span><span className="workspace-kpi-icon"><Icon size={18} /></span></div>
            <div className="workspace-kpi-value">{value}</div>
            <div className="workspace-kpi-note">{note}</div>
          </article>
        ))}
      </section>

      <section className="workspace-grid">
        <article className="workspace-card">
          <header className="workspace-card-head">
            <div><h2 className="workspace-card-title">Próximas tareas</h2><p className="workspace-card-description">Prioridades del equipo ordenadas por vencimiento.</p></div>
            <Link className="workspace-button" href="/tasks">Ver tareas <ArrowRight size={15} /></Link>
          </header>
          <div className="workspace-card-body">
            {tasks.length ? (
              <div className="workspace-list">
                {tasks.map((task) => (
                  <div className="workspace-list-row" key={task.id}>
                    <div className="workspace-list-copy"><strong>{task.title}</strong><span>{task.dueDate ? `Vence ${date.format(new Date(task.dueDate))}` : 'Sin fecha límite'} · {task.status.replaceAll('_', ' ')}</span></div>
                    <span className="workspace-badge" data-tone={task.priority === 'urgente' ? 'danger' : undefined}>{task.priority}</span>
                  </div>
                ))}
              </div>
            ) : <div className="workspace-empty">No hay tareas pendientes. El equipo está al día.</div>}
          </div>
        </article>

        <div className="workspace-stack">
          <article className="workspace-card">
            <header className="workspace-card-head"><div><h2 className="workspace-card-title">Pulso comercial</h2><p className="workspace-card-description">Movimiento de los últimos siete días.</p></div></header>
            <div className="workspace-health">
              <div className="workspace-health-row"><span>Nuevos leads</span><strong>{kpis.newLeads}</strong></div>
              <div className="workspace-health-row"><span>Pipeline abierto</span><strong>{kpis.openLeads}</strong></div>
              <div className="workspace-health-row"><span>Clientes activos</span><strong>{kpis.activeClients}</strong></div>
            </div>
          </article>
          <article className="workspace-card">
            <header className="workspace-card-head"><div><h2 className="workspace-card-title">Estado del centro</h2><p className="workspace-card-description">Servicios visibles para la operación.</p></div></header>
            <div className="workspace-health">
              <div className="workspace-health-row"><span>Base de datos</span><span className="workspace-health-status"><i className="workspace-health-dot" /> Operativa</span></div>
              <div className="workspace-health-row"><span>Sesión Payload</span><span className="workspace-health-status"><i className="workspace-health-dot" /> Segura</span></div>
              <div className="workspace-health-row"><span>Aislamiento tenant</span><span className="workspace-health-status"><i className="workspace-health-dot" /> Activo</span></div>
            </div>
          </article>
          {kpis.staleConversations > 0 ? (
            <article className="workspace-card">
              <header className="workspace-card-head"><div><h2 className="workspace-card-title">Atención requerida</h2><p className="workspace-card-description">{kpis.staleConversations} conversaciones llevan más de cuatro horas sin actividad.</p></div><Clock3 size={18} /></header>
            </article>
          ) : null}
        </div>
      </section>
    </div>
  )
}
