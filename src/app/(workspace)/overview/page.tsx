import React from 'react'
import Link from 'next/link'

export default function OverviewPage() {
  return (
    <div style={{ padding: '32px 40px', background: '#050505', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
        <div>
          <div style={{ fontSize: 10, color: '#00ffaa', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            ● SISTEMA_OPERATIVO_EN_VIVO
          </div>
          <h1 style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 700, color: '#fff' }}>
            Command Center // Overview
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            href="/crm"
            style={{
              background: '#fff',
              color: '#000',
              padding: '8px 16px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textDecoration: 'none',
              borderRadius: 4,
            }}
          >
            + NUEVO LEAD
          </Link>
          <Link
            href="/tasks"
            style={{
              background: '#181818',
              color: '#fff',
              border: '1px solid #333',
              padding: '8px 16px',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textDecoration: 'none',
              borderRadius: 4,
            }}
          >
            + NUEVA TAREA
          </Link>
        </div>
      </div>

      {/* KPI Matrix */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 20,
          marginBottom: 32,
        }}
      >
        <div style={{ background: '#090909', border: '1px solid #1a1a1a', padding: 20, borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Pipeline & Leads
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '12px 0 4px' }}>
            128 Leads
          </div>
          <div style={{ fontSize: 11, color: '#00ffaa' }}>+12 nuevos esta semana</div>
        </div>

        <div style={{ background: '#090909', border: '1px solid #1a1a1a', padding: 20, borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Cobranzas del Mes
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '12px 0 4px' }}>
            $8,450 USD
          </div>
          <div style={{ fontSize: 11, color: '#ffaa00' }}>70% de la meta mensual</div>
        </div>

        <div style={{ background: '#090909', border: '1px solid #1a1a1a', padding: 20, borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Atención Omnicanal
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '12px 0 4px' }}>
            3 En Espera
          </div>
          <div style={{ fontSize: 11, color: '#ff3333' }}>&gt; 4 horas sin respuesta</div>
        </div>

        <div style={{ background: '#090909', border: '1px solid #1a1a1a', padding: 20, borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: '#666', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Productividad Tareas
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '12px 0 4px' }}>
            14 Pendientes
          </div>
          <div style={{ fontSize: 11, color: '#00aaff' }}>2 urgentes asignadas</div>
        </div>
      </div>

      {/* Main Grid: Hoy Engine & Radars */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Left Column: Hoy Followups */}
        <div style={{ background: '#090909', border: '1px solid #1a1a1a', padding: 24, borderRadius: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#aaa', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              🎯 Seguimientos de Hoy (&ldquo;Hoy Engine&rdquo;)
            </div>
            <Link href="/crm" style={{ fontSize: 10, color: '#00ffaa', textDecoration: 'none' }}>
              VER CRM COMPLETO →
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, background: '#0d0d0d', border: '1px solid #1f1f1f', borderRadius: 4 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>María González</div>
                <div style={{ fontSize: 10, color: '#666' }}>LEAD // 3 DÍAS SIN CONTACTO // INTERESADA EN PLAN PRO</div>
              </div>
              <span style={{ fontSize: 10, color: '#00ffaa', border: '1px solid #00ffaa44', padding: '4px 10px', borderRadius: 4 }}>
                WHATSAPP ➔
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 14, background: '#0d0d0d', border: '1px solid #1f1f1f', borderRadius: 4 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Carlos Mendoza</div>
                <div style={{ fontSize: 10, color: '#666' }}>CLIENTE // 5 DÍAS // VENCIMIENTO DE MEMBRESÍA</div>
              </div>
              <span style={{ fontSize: 10, color: '#00ffaa', border: '1px solid #00ffaa44', padding: '4px 10px', borderRadius: 4 }}>
                WHATSAPP ➔
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Radars & Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ background: '#090909', border: '1px solid #1a1a1a', padding: 20, borderRadius: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#ff3333', letterSpacing: '0.08em', marginBottom: 12 }}>
              🚨 ALERTAS & FORMULARIOS
            </div>
            <div style={{ fontSize: 12, color: '#eee', lineHeight: 1.4 }}>
              Queja recibida en formulario Tally: <strong style={{ color: '#fff' }}>Carlos R.</strong> reportó inconveniente de soporte.
            </div>
            <div style={{ marginTop: 10, fontSize: 10, color: '#888' }}>
              ➔ Tarea urgente generada automáticamente [#104]
            </div>
          </div>

          <div style={{ background: '#090909', border: '1px solid #1a1a1a', padding: 20, borderRadius: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#aa00ff', letterSpacing: '0.08em', marginBottom: 12 }}>
              📱 RADAR REDES SOCIALES
            </div>
            <div style={{ fontSize: 12, color: '#eee' }}>
              Instagram: <strong style={{ color: '#fff' }}>&ldquo;5 tips para escalar tu negocio&rdquo;</strong>
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: '#00ffaa' }}>
              Programado para hoy 18:00 UTC-4
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
