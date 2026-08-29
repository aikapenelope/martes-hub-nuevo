import React from 'react'
import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleAlert,
  CircleDollarSign,
  FileSpreadsheet,
  Layers,
  MessageSquare,
  PhoneCall,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react'

import { getAnalyticsData } from '@/lib/analytics-data'
import { getWorkspaceContext } from '@/lib/workspace-context'

const usd = new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string | string[] }>
}) {
  const params = await searchParams
  const context = await getWorkspaceContext(params)
  const data = await getAnalyticsData(context)

  const { funnel, satisfaction, sources, activities, financials } = data

  const kpis = [
    {
      label: 'Conversión Lead ➔ Cliente',
      value: `${funnel.leadToClientPct}%`,
      note: `${funnel.convertedToClients} clientes originados de ${funnel.totalLeads} leads`,
      icon: UserCheck,
      tone: funnel.leadToClientPct >= 20 ? 'positive' : undefined,
    },
    {
      label: 'Satisfacción Formularios',
      value: `${satisfaction.satisfactionRate}%`,
      note: `${satisfaction.positiveSubmissions} envíos sin quejas de ${satisfaction.totalSubmissions} totales`,
      icon: Sparkles,
      tone: satisfaction.satisfactionRate >= 90 ? 'positive' : satisfaction.satisfactionRate < 70 ? 'danger' : undefined,
    },
    {
      label: 'Actividad Comercial (Mes)',
      value: activities.totalMonth,
      note: `${activities.byType.llamada} llamadas, ${activities.byType.reunion} reuniones, ${activities.byType.whatsapp} chats`,
      icon: Activity,
    },
    {
      label: 'Cobrado en el Mes',
      value: usd.format(financials.collectedMonth),
      note: `${usd.format(financials.pendingCollection)} pendiente por cobrar`,
      icon: CircleDollarSign,
    },
  ]

  return (
    <div className="workspace-page">
      <section className="workspace-page-head">
        <div>
          <div className="workspace-eyebrow">
            <span className="workspace-eyebrow-dot" /> Inteligencia y analítica
          </div>
          <h1 className="workspace-title">Métricas de conversión y calidad</h1>
          <p className="workspace-subtitle">
            Rendimiento comercial, embudo de leads y satisfacción para {context.tenant.name}.
          </p>
        </div>
        <div className="workspace-actions">
          <Link className="workspace-button" href="/crm">
            <Users size={16} /> Ver CRM
          </Link>
          <Link className="workspace-button workspace-button-primary" href="/billing">
            <TrendingUp size={16} /> Ver cobros
          </Link>
        </div>
      </section>

      {/* KPI CARDS */}
      <section className="workspace-kpis" aria-label="Indicadores principales de analítica">
        {kpis.map(({ label, value, note, icon: Icon, tone }) => (
          <article className="workspace-card workspace-kpi" key={label}>
            <div className="workspace-kpi-top">
              <span className="workspace-kpi-label">{label}</span>
              <span className="workspace-kpi-icon">
                <Icon size={18} />
              </span>
            </div>
            <div className="workspace-kpi-value" style={tone === 'positive' ? { color: 'var(--workspace-accent, #00ffaa)' } : undefined}>
              {value}
            </div>
            <div className="workspace-kpi-note">{note}</div>
          </article>
        ))}
      </section>

      {/* EMBUDO & SATISFACCIÓN */}
      <section className="workspace-grid" style={{ marginTop: '1rem' }}>
        {/* EMBUDO DE CONVERSIÓN */}
        <article className="workspace-card">
          <header className="workspace-card-head">
            <div>
              <h2 className="workspace-card-title">Embudo de conversión de leads</h2>
              <p className="workspace-card-description">
                Progresión de etapas desde la captación hasta el cierre.
              </p>
            </div>
            <BarChart3 size={18} />
          </header>
          <div className="workspace-card-body">
            {funnel.totalLeads === 0 ? (
              <div className="workspace-empty">Sin leads registrados en el tenant activo.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Paso 1: Total -> Contactado */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.375rem' }}>
                    <span>
                      <strong>Nuevo ➔ Contactado</strong> ({funnel.contactado + funnel.calificado + funnel.convertedToClients} de {funnel.totalLeads})
                    </span>
                    <strong style={{ color: 'var(--workspace-accent, #00ffaa)' }}>{funnel.nuevoToContactadoPct}%</strong>
                  </div>
                  <div style={{ height: '8px', background: 'var(--workspace-border, #1a1a1a)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(funnel.nuevoToContactadoPct, 4))}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #3b82f6, #00ffaa)',
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                </div>

                {/* Paso 2: Contactado -> Calificado */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.375rem' }}>
                    <span>
                      <strong>Contactado ➔ Calificado</strong> ({funnel.calificado + funnel.convertedToClients} de {funnel.contactado + funnel.calificado + funnel.convertedToClients})
                    </span>
                    <strong style={{ color: '#ffaa00' }}>{funnel.contactadoToCalificadoPct}%</strong>
                  </div>
                  <div style={{ height: '8px', background: 'var(--workspace-border, #1a1a1a)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(funnel.contactadoToCalificadoPct, 4))}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #ffaa00, #ff5500)',
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                </div>

                {/* Paso 3: Calificado -> Cliente Cerrado */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.375rem' }}>
                    <span>
                      <strong>Calificado ➔ Cliente Cerrado</strong> ({funnel.convertedToClients} clientes activos)
                    </span>
                    <strong style={{ color: '#00aaff' }}>{funnel.leadToClientPct}% global</strong>
                  </div>
                  <div style={{ height: '8px', background: 'var(--workspace-border, #1a1a1a)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(funnel.leadToClientPct, 4))}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #00aaff, #aa00ff)',
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                </div>

                {/* Resumen de estados */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '0.5rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid var(--workspace-border, #1a1a1a)',
                    textAlign: 'center',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--workspace-muted, #777)', textTransform: 'uppercase' }}>Nuevos</span>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>{funnel.nuevo}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--workspace-muted, #777)', textTransform: 'uppercase' }}>Contactados</span>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>{funnel.contactado}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--workspace-muted, #777)', textTransform: 'uppercase' }}>Calificados</span>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700 }}>{funnel.calificado}</div>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--workspace-muted, #777)', textTransform: 'uppercase' }}>Descartados</span>
                    <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f87171' }}>{funnel.descartado}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </article>

        {/* SATISFACCIÓN Y CALIDAD FORMULARIOS */}
        <div className="workspace-stack">
          <article className="workspace-card">
            <header className="workspace-card-head">
              <div>
                <h2 className="workspace-card-title">Calidad y Formularios Tally</h2>
                <p className="workspace-card-description">Métricas de satisfacción y quejas en tiempo real.</p>
              </div>
              <FileSpreadsheet size={18} />
            </header>
            <div className="workspace-health">
              <div className="workspace-health-row">
                <span>Total respuestas recibidas</span>
                <strong>{satisfaction.totalSubmissions}</strong>
              </div>
              <div className="workspace-health-row">
                <span>Envíos sin quejas</span>
                <span className="workspace-health-status">
                  <i className="workspace-health-dot" /> {satisfaction.positiveSubmissions} ({satisfaction.satisfactionRate}%)
                </span>
              </div>
              <div className="workspace-health-row">
                <span>Alertas / Quejas detectadas</span>
                <strong>
                  {satisfaction.complaints > 0 ? (
                    <span style={{ color: '#f87171', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CircleAlert size={14} /> {satisfaction.complaints}
                    </span>
                  ) : (
                    <span style={{ color: '#00ffaa', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={14} /> 0 alertas
                    </span>
                  )}
                </strong>
              </div>
            </div>
          </article>

          {/* DESGLOSE DE ACTIVIDADES */}
          <article className="workspace-card">
            <header className="workspace-card-head">
              <div>
                <h2 className="workspace-card-title">Interacciones del equipo</h2>
                <p className="workspace-card-description">Timeline registrado en el mes actual.</p>
              </div>
              <Activity size={18} />
            </header>
            <div className="workspace-health">
              <div className="workspace-health-row">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <PhoneCall size={14} /> Llamadas
                </span>
                <strong>{activities.byType.llamada}</strong>
              </div>
              <div className="workspace-health-row">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MessageSquare size={14} /> WhatsApp
                </span>
                <strong>{activities.byType.whatsapp}</strong>
              </div>
              <div className="workspace-health-row">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Users size={14} /> Reuniones
                </span>
                <strong>{activities.byType.reunion}</strong>
              </div>
              <div className="workspace-health-row">
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={14} /> Notas y seguimiento
                </span>
                <strong>{activities.byType.nota + activities.byType.email + activities.byType.otro}</strong>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* CANALES DE ADQUISICIÓN */}
      <section className="workspace-card" style={{ marginTop: '1rem' }}>
        <header className="workspace-card-head">
          <div>
            <h2 className="workspace-card-title">Canales de adquisición de leads</h2>
            <p className="workspace-card-description">Origen y procedencia de prospectos en {context.tenant.name}.</p>
          </div>
          <Link className="workspace-button" href="/crm">
            Explorar CRM <ArrowRight size={15} />
          </Link>
        </header>
        <div className="workspace-card-body">
          {sources.length === 0 ? (
            <div className="workspace-empty">No hay registros de leads suficientes para segmentar canales.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {sources.map((item) => (
                <div
                  key={item.source}
                  style={{
                    border: '1px solid var(--workspace-border, #1a1a1a)',
                    background: 'var(--workspace-surface, #090909)',
                    padding: '1rem',
                    borderRadius: '6px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.5rem' }}>
                    <strong style={{ fontSize: '0.875rem' }}>{item.label}</strong>
                    <span className="workspace-badge">{item.pct}%</span>
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{item.count} leads</div>
                  <div style={{ height: '4px', background: 'var(--workspace-border, #1a1a1a)', borderRadius: '2px', marginTop: '0.5rem', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(item.pct, 4)}%`, height: '100%', background: 'var(--workspace-accent, #00ffaa)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
