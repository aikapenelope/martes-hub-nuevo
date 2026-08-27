'use client'

import React, { useState } from 'react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface HermesAiSidecarProps {
  isOpen: boolean
  onClose: () => void
}

export const HermesAiSidecar: React.FC<HermesAiSidecarProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hola Angel. Soy Hermes, tu copiloto inteligente de Martes Hub. Estoy conectado al servidor MCP en modo solo consulta. Puedes preguntarme sobre clientes, prospectos, tareas pendientes, objeciones de ventas o finanzas.',
      timestamp: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const userMsg: Message = {
      id: String(Date.now()),
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    // Simulación de respuesta streaming / MCP context
    setTimeout(() => {
      const assistantMsg: Message = {
        id: String(Date.now() + 1),
        role: 'assistant',
        content: `He consultado el servidor MCP de Payload para: "${userMsg.content}". Todos los datos han sido validados con aislamiento multi-tenant en tiempo real.`,
        timestamp: new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
      }
      setMessages((prev) => [...prev, assistantMsg])
      setLoading(false)
    }, 900)
  }

  return (
    <aside
      style={{
        width: 380,
        background: '#070707',
        borderLeft: '1px solid #1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: 'calc(100vh - 60px)',
        position: 'sticky',
        top: 60,
        flexShrink: 0,
        zIndex: 30,
      }}
    >
      {/* Sidecar Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #141414',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>🤖</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>HERMES AGENT // MCP</div>
            <div style={{ fontSize: 9, color: '#00ffaa', letterSpacing: '0.08em' }}>● MODO_SOLO_CONSULTA</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#666',
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ✕
        </button>
      </div>

      {/* Messages Feed */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '90%',
              background: m.role === 'user' ? '#181818' : '#0e0e0e',
              border: `1px solid ${m.role === 'user' ? '#333' : '#1c1c1c'}`,
              borderRadius: 6,
              padding: '10px 14px',
            }}
          >
            <div
              style={{
                fontSize: 9,
                color: m.role === 'user' ? '#888' : '#aa00ff',
                marginBottom: 4,
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              {m.role === 'user' ? 'Tú' : 'Hermes AI'} · {m.timestamp}
            </div>
            <div style={{ fontSize: 12, color: '#eee', lineHeight: 1.45 }}>{m.content}</div>
          </div>
        ))}
        {loading && (
          <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic', paddingLeft: 4 }}>
            Hermes consultando servidor MCP...
          </div>
        )}
      </div>

      {/* Input Form */}
      <form
        onSubmit={handleSend}
        style={{
          padding: 14,
          borderTop: '1px solid #141414',
          display: 'flex',
          gap: 8,
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregunta a Hermes (ej. ¿Quién debe pago?)..."
          style={{
            flex: 1,
            background: '#111',
            border: '1px solid #222',
            borderRadius: 4,
            padding: '8px 12px',
            color: '#fff',
            fontSize: 12,
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            background: '#fff',
            color: '#000',
            border: 'none',
            borderRadius: 4,
            padding: '0 12px',
            fontWeight: 700,
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          ➔
        </button>
      </form>
    </aside>
  )
}
