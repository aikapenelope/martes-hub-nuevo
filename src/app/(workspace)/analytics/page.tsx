import React from 'react'

export default function AnalyticsPage() {
  return (
    <div style={{ padding: '32px 40px', background: '#050505', minHeight: '100%' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 10, color: '#00ffaa', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          ● INTELIGENCIA_Y_MÉTRICAS
        </div>
        <h1 style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 700, color: '#fff' }}>
          Analytics & Intelligence // Conversión & NPS
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
        <div style={{ background: '#090909', border: '1px solid #1a1a1a', borderRadius: 6, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 14 }}>
            Embudo de Conversión de Leads
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aaa', marginBottom: 4 }}>
                <span>Nuevo ➔ Contactado</span>
                <span>78%</span>
              </div>
              <div style={{ height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: '78%', height: '100%', background: '#00ffaa' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#aaa', marginBottom: 4 }}>
                <span>Contactado ➔ Calificado</span>
                <span>44%</span>
              </div>
              <div style={{ height: 6, background: '#1a1a1a', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: '44%', height: '100%', background: '#ffaa00' }} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: '#090909', border: '1px solid #1a1a1a', borderRadius: 6, padding: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 14 }}>
            Satisfacción del Cliente (NPS Tally Forms)
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#00ffaa', margin: '10px 0' }}>
            +72 NPS
          </div>
          <div style={{ fontSize: 11, color: '#666' }}>Basado en 38 respuestas de formularios de satisfacción</div>
        </div>
      </div>
    </div>
  )
}
