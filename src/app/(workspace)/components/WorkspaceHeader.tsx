'use client'

import React from 'react'

interface WorkspaceHeaderProps {
  userEmail?: string
  userName?: string
  onToggleAiDrawer?: () => void
  isAiDrawerOpen?: boolean
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  userEmail,
  userName,
  onToggleAiDrawer,
  isAiDrawerOpen,
}) => {
  const displayName = userName || userEmail?.split('@')[0] || 'Agente'

  return (
    <header
      style={{
        height: 60,
        background: '#050505',
        borderBottom: '1px solid #1a1a1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      {/* Search & Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: '#0c0c0c',
            border: '1px solid #222',
            padding: '6px 14px',
            borderRadius: 4,
            width: 320,
            fontSize: 12,
            color: '#666',
          }}
        >
          <span>🔍</span>
          <span>Buscar cliente, lead, tarea...</span>
          <kbd
            style={{
              marginLeft: 'auto',
              background: '#1a1a1a',
              color: '#888',
              padding: '2px 6px',
              borderRadius: 3,
              fontSize: 10,
              fontFamily: 'monospace',
            }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      {/* System Status Indicators & AI Sidecar Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {/* Live Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 10, letterSpacing: '0.08em' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#00ffaa' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ffaa' }} />
            <span>META_API</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#00ffaa' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ffaa' }} />
            <span>RESEND</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#00aaff' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00aaff' }} />
            <span>MCP_SERVER</span>
          </div>
        </div>

        {/* User Info */}
        <div style={{ borderLeft: '1px solid #222', paddingLeft: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{displayName}</div>
            <div style={{ fontSize: 9, color: '#555', textTransform: 'uppercase' }}>Sesión Activa</div>
          </div>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: '#1a1a1a',
              border: '1px solid #333',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
        </div>

        {/* Hermes AI Toggle Button */}
        <button
          type="button"
          onClick={onToggleAiDrawer}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: isAiDrawerOpen ? '#aa00ff' : '#141414',
            border: isAiDrawerOpen ? '1px solid #cc33ff' : '1px solid #333',
            color: '#fff',
            padding: '7px 14px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            transition: 'all 0.2s ease',
          }}
        >
          <span>🤖</span>
          <span>HERMES AI</span>
          <kbd
            style={{
              background: 'rgba(255,255,255,0.15)',
              padding: '1px 4px',
              borderRadius: 2,
              fontSize: 9,
            }}
          >
            ⌘J
          </kbd>
        </button>
      </div>
    </header>
  )
}
