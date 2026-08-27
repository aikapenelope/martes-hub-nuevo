import React from 'react'

export default function SocialPage() {
  return (
    <div style={{ padding: '32px 40px', background: '#050505', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 10, color: '#aa00ff', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            ● PUBLICACIÓN_Y_MÉTRICAS
          </div>
          <h1 style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 700, color: '#fff' }}>
            Social Hub // Calendario Editorial & Engagement
          </h1>
        </div>
        <button style={{ background: '#fff', color: '#000', border: 'none', padding: '8px 16px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          + PROGRAMAR POST
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <div style={{ background: '#090909', border: '1px solid #1a1a1a', borderRadius: 6, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 16, textTransform: 'uppercase' }}>
            Calendario Editorial de la Semana
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, textAlign: 'center' }}>
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => (
              <div key={d} style={{ background: '#121212', border: '1px solid #222', borderRadius: 4, padding: 12 }}>
                <div style={{ fontSize: 11, color: '#666' }}>{d}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', margin: '6px 0' }}>27</div>
                <div style={{ fontSize: 9, color: '#00ffaa', background: '#00ffaa15', padding: '2px 4px', borderRadius: 2 }}>
                  1 Post
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: '#090909', border: '1px solid #1a1a1a', borderRadius: 6, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 16, textTransform: 'uppercase' }}>
            Cuentas Conectadas (Meta API)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: '#121212', border: '1px solid #222', padding: 12, borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>@marteshub.oficial</div>
                <div style={{ fontSize: 10, color: '#666' }}>Instagram Business</div>
              </div>
              <span style={{ fontSize: 9, color: '#00ffaa' }}>● CONECTADA</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
