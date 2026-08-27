import React from 'react'

export default function CrmPage() {
  return (
    <div style={{ padding: '32px 40px', background: '#050505', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 10, color: '#00ffaa', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            ● PIPELINE_Y_CARTERA
          </div>
          <h1 style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 700, color: '#fff' }}>
            CRM Studio // Leads & Clientes 360°
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{ background: '#111', color: '#fff', border: '1px solid #333', padding: '8px 16px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            FILTRAR RUBRO
          </button>
          <button style={{ background: '#fff', color: '#000', border: 'none', padding: '8px 16px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            + CREAR LEAD
          </button>
        </div>
      </div>

      {/* Pipeline Columns Blueprint */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {['Nuevo (18)', 'Contactado (32)', 'Calificado (14)', 'Cerrado / Ganado (24)'].map((col, idx) => (
          <div key={col} style={{ background: '#090909', border: '1px solid #1a1a1a', borderRadius: 6, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 14 }}>
              {col}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: '#121212', border: '1px solid #222', padding: 12, borderRadius: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>Prospecto #{idx + 101}</div>
                <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>Rubro: Tecnología · Origen: Tally</div>
                <div style={{ fontSize: 10, color: '#00ffaa', marginTop: 8 }}>Score: 85/100</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
