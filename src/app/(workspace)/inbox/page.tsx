import React from 'react'

export default function InboxPage() {
  return (
    <div style={{ padding: '32px 40px', background: '#050505', minHeight: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, color: '#00ffaa', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          ● MENSAJERÍA_OMNICANAL
        </div>
        <h1 style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 700, color: '#fff' }}>
          Unified Inbox // WhatsApp + Instagram + Email
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, height: 'calc(100vh - 200px)' }}>
        {/* Threads List */}
        <div style={{ background: '#090909', border: '1px solid #1a1a1a', borderRadius: 6, overflowY: 'auto', padding: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', marginBottom: 12, textTransform: 'uppercase' }}>
            Conversaciones Activas
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ background: '#141414', borderLeft: '3px solid #00ffaa', padding: 12, borderRadius: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>+58 412 8899001</div>
                <span style={{ fontSize: 9, color: '#00ffaa' }}>WHATSAPP</span>
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>&ldquo;¿Tienen disponibilidad para demo?&rdquo;</div>
            </div>
          </div>
        </div>

        {/* Active Chat View */}
        <div style={{ background: '#090909', border: '1px solid #1a1a1a', borderRadius: 6, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 20 }}>
          <div style={{ borderBottom: '1px solid #1a1a1a', paddingBottom: 14, display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>María González (Lead #120)</div>
              <div style={{ fontSize: 10, color: '#00ffaa' }}>Ventana 24h Meta: ABIERTA</div>
            </div>
            <button style={{ background: '#1a1a1a', color: '#fff', border: '1px solid #333', padding: '4px 10px', borderRadius: 4, fontSize: 10 }}>
              Plantillas Aprobadas
            </button>
          </div>
          <div style={{ textAlign: 'center', color: '#555', fontSize: 12 }}>
            [ Historial de mensajes sincronizados con OpenBSP ]
          </div>
          <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 14 }}>
            <input
              type="text"
              placeholder="Escribe una respuesta rápida..."
              style={{ width: '100%', background: '#111', border: '1px solid #222', padding: '10px 14px', borderRadius: 4, color: '#fff', fontSize: 12, outline: 'none' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
