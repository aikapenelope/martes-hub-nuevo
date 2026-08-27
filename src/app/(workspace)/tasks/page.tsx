import React from 'react'

export default function TasksPage() {
  return (
    <div style={{ padding: '32px 40px', background: '#050505', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 10, color: '#00aaff', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            ● GESTIÓN_DE_EQUIPO
          </div>
          <h1 style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 700, color: '#fff' }}>
            Task Manager // Kanban & Subtareas
          </h1>
        </div>
        <button style={{ background: '#fff', color: '#000', border: 'none', padding: '8px 16px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
          + NUEVA TAREA
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
        {['Pendiente (6)', 'En Progreso (4)', 'Bloqueada (1)', 'Completada (12)', 'Cancelada (0)'].map((col) => (
          <div key={col} style={{ background: '#090909', border: '1px solid #1a1a1a', borderRadius: 6, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', marginBottom: 12 }}>
              {col}
            </div>
            <div style={{ background: '#121212', border: '1px solid #222', padding: 10, borderRadius: 4, marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>Resolver queja Tally #402</div>
              <div style={{ fontSize: 9, color: '#ff3333', marginTop: 4, fontWeight: 700 }}>PRIORIDAD: URGENTE</div>
              <div style={{ fontSize: 10, color: '#666', marginTop: 6 }}>Subtareas: 1/2 listas</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
