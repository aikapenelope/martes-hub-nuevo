'use client'

/**
 * HermesAiSidecar — panel de chat in-app para Hermes.
 *
 * Usa @ai-sdk/react v4 (useChat) + DefaultChatTransport de Vercel AI SDK v7.
 * El transport envía al endpoint POST /api/ai/chat con las cookies de sesión
 * de Payload (same-origin) para autenticación. El agente tiene acceso de solo
 * lectura al CRM via tools definidas en el route handler.
 *
 * Requiere ANTHROPIC_API_KEY u OPENAI_API_KEY en las env vars.
 */

import { Bot, Send, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'

interface HermesAiSidecarProps {
  isOpen: boolean
  onClose: () => void
}

const PROMPTS_SUGERIDOS = [
  '¿Cuántos leads nuevos hay?',
  '¿Qué cobros están vencidos?',
  'Tareas urgentes pendientes',
  'Resumen del pipeline',
]

export function HermesAiSidecar({ isOpen, onClose }: HermesAiSidecarProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      credentials: 'include',
      // Sobrescribe la URL: el DefaultChatTransport v7 usa /{chatId}/stream
      // por defecto. prepareSendMessagesRequest la fija a /api/ai/chat.
      prepareSendMessagesRequest: ({ messages: msgs }) => ({
        api: '/api/ai/chat',
        body: { messages: msgs },
      }),
    }),
  })

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend() {
    const text = input.trim()
    if (!text || status === 'streaming' || status === 'submitted') return
    setInput('')
    void sendMessage({ text })
  }

  if (!isOpen) return null

  const isLoading = status === 'streaming' || status === 'submitted'

  return (
    <aside className="workspace-drawer" aria-label="Hermes — Asistente de Martes Hub">
      <div className="workspace-drawer-inner">
        {/* Header */}
        <div className="workspace-drawer-head">
          <div>
            <strong>Hermes</strong>
            <div className="workspace-card-description">Asistente IA · solo lectura</div>
          </div>
          <button
            className="workspace-icon-button"
            type="button"
            onClick={onClose}
            aria-label="Cerrar Hermes"
          >
            <X size={18} />
          </button>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          {error && (
            <div
              style={{
                padding: '0.75rem',
                borderRadius: '0.625rem',
                background: 'color-mix(in srgb, var(--workspace-danger) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--workspace-danger) 35%, var(--workspace-border))',
                color: 'var(--workspace-danger)',
                fontSize: '0.75rem',
              }}
            >
              {error.message.includes('503') || error.message.includes('ANTHROPIC') || error.message.includes('OPENAI')
                ? 'Sin proveedor de IA configurado. Añade ANTHROPIC_API_KEY u OPENAI_API_KEY.'
                : error.message}
            </div>
          )}

          {messages.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '1.5rem 0',
                textAlign: 'center',
                color: 'var(--workspace-muted)',
              }}
            >
              <Bot size={28} style={{ marginBottom: '0.75rem', opacity: 0.5 }} aria-hidden="true" />
              <p style={{ fontSize: '0.8125rem', lineHeight: 1.5, maxWidth: '14rem', margin: 0 }}>
                Pregúntame sobre tus clientes, leads, tareas o cobros.
              </p>
              <div
                style={{
                  marginTop: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  width: '100%',
                }}
              >
                {PROMPTS_SUGERIDOS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    style={{
                      padding: '0.5rem 0.75rem',
                      border: '1px solid var(--workspace-border)',
                      borderRadius: '0.625rem',
                      background: 'var(--workspace-raised)',
                      color: 'var(--workspace-muted)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onClick={() => void sendMessage({ text: prompt })}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => {
                const textParts = msg.parts?.filter((p) => p.type === 'text') ?? []
                const hasToolCalls = msg.parts?.some((p) => p.type === 'tool-invocation') ?? false
                if (textParts.length === 0 && !hasToolCalls) return null
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '85%',
                        padding: '0.625rem 0.875rem',
                        borderRadius: '0.75rem',
                        fontSize: '0.8125rem',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        background:
                          msg.role === 'user'
                            ? 'var(--workspace-accent)'
                            : 'var(--workspace-raised)',
                        color:
                          msg.role === 'user' ? '#071b15' : 'var(--workspace-text)',
                        border:
                          msg.role === 'user'
                            ? 'none'
                            : '1px solid var(--workspace-border)',
                      }}
                    >
                      {textParts.map((p, i) => (
                        <span key={i}>{(p as { type: 'text'; text: string }).text}</span>
                      ))}
                      {hasToolCalls && textParts.length === 0 && (
                        <span style={{ fontSize: '0.6875rem', opacity: 0.6 }}>
                          Consultando datos…
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}

              {isLoading && (
                <div style={{ display: 'flex', gap: '0.25rem', paddingLeft: '0.25rem' }}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="hermes-dot"
                      style={{ animationDelay: `${i * 0.18}s` }}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div
          style={{
            padding: '0.75rem',
            borderTop: '1px solid var(--workspace-border)',
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'flex-end',
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pregúntale a Hermes…"
            rows={2}
            style={{
              flex: 1,
              padding: '0.625rem 0.75rem',
              border: '1px solid var(--workspace-border)',
              borderRadius: '0.625rem',
              background: 'var(--workspace-raised)',
              color: 'var(--workspace-text)',
              font: 'inherit',
              fontSize: '0.8125rem',
              resize: 'none',
              outline: 'none',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <button
            type="button"
            className="workspace-icon-button"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            aria-label="Enviar mensaje"
            style={{ flexShrink: 0 }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
