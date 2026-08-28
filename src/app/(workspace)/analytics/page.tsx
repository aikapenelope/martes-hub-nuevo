/**
 * Analytics & Intelligence — Métricas reales del tenant activo.
 *
 * Patrón de datos: igual a overview-data.ts y billing/page.tsx.
 * Todas las queries usan overrideAccess: false + user (QUERIES.md).
 * Los agregados monetarios usan paymentsAggregate (SQL directo, db-aggregates.ts).
 * Ningún dato es hardcodeado — todos vienen de las colecciones del tenant.
 */

import 'server-only'

import Link from 'next/link'
import type { Where } from 'payload'
import { Activity, ArrowRight, BarChart3, CircleDollarSign, ThumbsUp, Users } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { paymentsAggregate, startOfMonthIso } from '@/lib/overview-data'

const currency = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const pct = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 100) : 0)

// Barra de progreso en CSS con tokens del workspace
function FunnelBar({ value, max, label, count }: { value: number; max: number; label: string; count: number }) {
  const width = max > 0 ? Math.max(Math.round((value / max) * 100), 3) : 0
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.375rem' }}>
        <span style={{ color: 'var(--workspace-text)' }}>{label}</span>
        <strong style={{ color: 'var(--workspace-text)' }}>{count}</strong>
      </div>
      <div style={{ height: '0.5rem', background: 'var(--workspace-raised)', borderRadius: 'var(--workspace-radius)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${width}%`,
            height: '100%',
            background: 'var(--workspace-accent)',
            borderRadius: 'var(--workspace-radius)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  )
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string | string[] }>
}) {
  const params = await searchParams
  const context = await getWorkspaceContext(params)
  const { payload, user, tenantId } = context

  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString()
  const startOfMonth = startOfMonthIso()

  // Helper query: overrideAccess: false + user — patrón canónico de overview-data.ts
  const q = <T extends Parameters<typeof payload.find>[0]>(options: T) =>
    payload.find({ ...options, overrideAccess: false, user } as T)

  const tenantFilter = (extra?: Where): Where => ({
    and: [{ tenant: { equals: tenantId } }, ...(extra ? [extra] : [])],
  })

  const [
    leadsNuevo,
    leadsContactado,
    leadsCalificado,
    leadsDescartado,
    clientsActive,
    formsTotal,
    formsComplaints,
    activitiesWeek,
    leadsWeek,
    revenueMonth,
    revenuePending,
  ] = await Promise.all([
    q({ collection: 'leads', limit: 0, where: tenantFilter({ status: { equals: 'nuevo' } }) }),
    q({ collection: 'leads', limit: 0, where: tenantFilter({ status: { equals: 'contactado' } }) }),
    q({ collection: 'leads', limit: 0, where: tenantFilter({ status: { equals: 'calificado' } }) }),
    q({ collection: 'leads', limit: 0, where: tenantFilter({ status: { equals: 'descartado' } }) }),
    q({ collection: 'clients', limit: 0, where: tenantFilter({ stage: { equals: 'activo' } }) }),
    q({ collection: 'form-submissions', limit: 0, where: { tenant: { equals: tenantId } } }),
    q({ collection: 'form-submissions', limit: 0, where: tenantFilter({ isComplaint: { equals: true } }) }),
    q({ collection: 'activities', limit: 0, where: tenantFilter({ createdAt: { greater_than_equal: sevenDaysAgo } }) }),
    q({ collection: 'leads', limit: 0, where: tenantFilter({ createdAt: { greater_than_equal: sevenDaysAgo } }) }),
    paymentsAggregate(payload, tenantId, ['pagado'], startOfMonth),
    paymentsAggregate(payload, tenantId, ['pendiente', 'vencido']),
  ])

  // Métricas calculadas
  const totalNuevo = leadsNuevo.totalDocs
  const totalContactado = leadsContactado.totalDocs
  const totalCalificado = leadsCalificado.totalDocs
  const totalActive = totalNuevo + totalContactado + totalCalificado
  const totalClients = clientsActive.totalDocs

  // Funnel: base = total activos (excluyendo descartados)
  const funnelBase = totalActive + totalClients
  const rateContactado = pct(totalContactado + totalCalificado + totalClients, funnelBase)
  const rateCalificado = pct(totalCalificado + totalClients, funnelBase)
  const rateConversion = pct(totalClients, funnelBase)

  const totalForms = formsTotal.totalDocs
  const satisfaccion = pct(totalForms - formsComplaints.totalDocs, totalForms)

  const kpis = [
    {
      label: 'Leads en pipeline',
      value: totalActive,
      note: `${leadsDescartado.totalDocs} descartados`,
      icon: BarChart3,
    },
    {
      label: 'Clientes activos',
      value: totalClients,
      note: `${rateConversion}% de conversión`,
      icon: Users,
    },
    {
      label: 'Cobrado este mes',
      value: currency.format(revenueMonth.total),
      note: `${currency.format(revenuePending.total)} por cobrar`,
      icon: CircleDollarSign,
    },
    {
      label: 'Satisfacción (Tally)',
      value: totalForms > 0 ? `${satisfaccion}%` : '—',
      note: totalForms > 0 ? `${totalForms} respuestas · ${formsComplaints.totalDocs} alertas` : 'Sin envíos registrados',
      icon: ThumbsUp,
    },
  ]

  return (
    <div className="workspace-page">
      {/* Encabezado */}
      <section className="workspace-page-head">
        <div>
          <div className="workspace-eyebrow">
            <span className="workspace-eyebrow-dot" /> Inteligencia comercial
          </div>
          <h1 className="workspace-title">Analytics</h1>
          <p className="workspace-subtitle">
            Conversión, satisfacción y actividad real de {context.tenant.name}.
          </p>
        </div>
      </section>

      {/* KPI row */}
      <section className="workspace-kpis" aria-label="Indicadores principales">
        {kpis.map(({ label, value, note, icon: Icon }) => (
          <article className="workspace-card workspace-kpi" key={label}>
            <div className="workspace-kpi-top">
              <span className="workspace-kpi-label">{label}</span>
              <span className="workspace-kpi-icon"><Icon size={18} /></span>
            </div>
            <div className="workspace-kpi-value">{value}</div>
            <div className="workspace-kpi-note">{note}</div>
          </article>
        ))}
      </section>

      {/* Grid principal */}
      <section className="workspace-grid" style={{ marginTop: '1.5rem' }}>

        {/* Izquierda: Embudo de conversión */}
        <article className="workspace-card">
          <header className="workspace-card-head">
            <div>
              <h2 className="workspace-card-title">Embudo de conversión</h2>
              <p className="workspace-card-description">
                Del primer contacto hasta cliente activo — {funnelBase} leads total.
              </p>
            </div>
            <Link className="workspace-button" href="/crm">
              Ver CRM <ArrowRight size={15} />
            </Link>
          </header>
          <div className="workspace-card-body" style={{ padding: '1.25rem' }}>
            {funnelBase === 0 ? (
              <div className="workspace-empty">Sin leads registrados todavía.</div>
            ) : (
              <>
                <FunnelBar value={totalNuevo} max={funnelBase} label="Nuevo" count={totalNuevo} />
                <FunnelBar value={totalContactado} max={funnelBase} label="Contactado" count={totalContactado} />
                <FunnelBar value={totalCalificado} max={funnelBase} label="Calificado" count={totalCalificado} />
                <FunnelBar value={totalClients} max={funnelBase} label="Convertido a cliente" count={totalClients} />

                {/* Tasas de paso */}
                <div
                  style={{
                    marginTop: '1.25rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid var(--workspace-border)',
                    display: 'flex',
                    gap: '1.5rem',
                    flexWrap: 'wrap',
                  }}
                >
                  {[
                    { label: 'Tasa de contacto', value: `${rateContactado}%` },
                    { label: 'Tasa de calificación', value: `${rateCalificado}%` },
                    { label: 'Tasa de conversión', value: `${rateConversion}%` },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--workspace-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {label}
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--workspace-accent)', marginTop: '0.25rem' }}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </article>

        {/* Derecha: Pulso de actividad + Satisfacción */}
        <div className="workspace-stack">
          <article className="workspace-card">
            <header className="workspace-card-head">
              <div>
                <h2 className="workspace-card-title">Pulso — últimos 7 días</h2>
                <p className="workspace-card-description">Movimiento reciente del equipo.</p>
              </div>
              <Activity size={18} />
            </header>
            <div className="workspace-health">
              {[
                { label: 'Leads nuevos', value: leadsWeek.totalDocs },
                { label: 'Actividades registradas', value: activitiesWeek.totalDocs },
                { label: 'Pipeline abierto', value: totalActive },
              ].map(({ label, value }) => (
                <div className="workspace-health-row" key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className="workspace-card">
            <header className="workspace-card-head">
              <div>
                <h2 className="workspace-card-title">Satisfacción (Tally Forms)</h2>
                <p className="workspace-card-description">
                  Basado en {totalForms} envío{totalForms !== 1 ? 's' : ''} de formularios.
                </p>
              </div>
              <Link className="workspace-button" href="/admin/collections/form-submissions">
                Ver envíos
              </Link>
            </header>
            <div className="workspace-health">
              <div className="workspace-health-row">
                <span>Total de respuestas</span>
                <strong>{totalForms}</strong>
              </div>
              <div className="workspace-health-row">
                <span>Alertas / quejas</span>
                <strong style={{ color: formsComplaints.totalDocs > 0 ? 'var(--workspace-danger)' : 'inherit' }}>
                  {formsComplaints.totalDocs}
                </strong>
              </div>
              <div className="workspace-health-row">
                <span>Tasa de satisfacción</span>
                <strong style={{ color: 'var(--workspace-accent)' }}>
                  {totalForms > 0 ? `${satisfaccion}%` : '—'}
                </strong>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>
  )
}
