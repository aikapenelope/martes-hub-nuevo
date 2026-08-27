import React from 'react'

export default function BillingPage() {
  return (
    <div style={{ padding: '32px 40px', background: '#050505', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 10, color: '#ffaa00', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            ● VENTAS_Y_COBRANZAS
          </div>
          <h1 style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 700, color: '#fff' }}>
            Billing & Commerce // Cotizaciones y Facturas
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={{ background: '#111', color: '#fff', border: '1px solid #333', padding: '8px 16px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            + CREAR COTIZACIÓN
          </button>
          <button style={{ background: '#fff', color: '#000', border: 'none', padding: '8px 16px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
            + NUEVA FACTURA
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
        <div style={{ background: '#090909', border: '1px solid #1a1a1a', borderRadius: 6, padding: 20 }}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>Total Cobrado Este Mes</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#00ffaa', margin: '8px 0' }}>$8,450 USD</div>
          <div style={{ fontSize: 10, color: '#666' }}>14 pagos registrados</div>
        </div>

        <div style={{ background: '#090909', border: '1px solid #1a1a1a', borderRadius: 6, padding: 20 }}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>Por Cobrar / Pendiente</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#ffaa00', margin: '8px 0' }}>$3,550 USD</div>
          <div style={{ fontSize: 10, color: '#666' }}>6 facturas abiertas</div>
        </div>

        <div style={{ background: '#090909', border: '1px solid #1a1a1a', borderRadius: 6, padding: 20 }}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>Cotizaciones en Negociación</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#aa00ff', margin: '8px 0' }}>$6,200 USD</div>
          <div style={{ fontSize: 10, color: '#666' }}>4 cotizaciones activas</div>
        </div>
      </div>
    </div>
  )
}
