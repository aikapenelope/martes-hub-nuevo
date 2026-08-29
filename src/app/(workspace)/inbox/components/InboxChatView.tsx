'use client'

import React, { useRef, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  MessageSquare,
  Send,
  ShieldAlert,
} from 'lucide-react'

import type { Conversation, Message } from '@/payload-types'
import { sendReplyAction } from '../actions'

interface InboxChatViewProps {
  conversation: Conversation
  messages: Message[]
  canEdit: boolean
  isWindowActive: boolean
}

export function InboxChatView({ conversation, messages, canEdit, isWindowActive }: InboxChatViewProps) {
  const [inputText, setInputText] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const client = conversation.client && typeof conversation.client === 'object' ? conversation.client : null
  const lead = conversation.lead && typeof conversation.lead === 'object' ? conversation.lead : null
  const contactName =
    (client && 'name' in client ? (client as { name?: string }).name : null) ||
    (lead && 'fullName' in lead ? (lead as { fullName?: string }).fullName : null) ||
    conversation.contactAddress

  const crmLink = client
    ? `/crm/clientes/${client.id}`
    : lead
      ? `/crm/leads/${lead.id}`
      : null

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputText.trim() || isPending) return

    setErrorMsg(null)
    const formData = new FormData()
    formData.set('conversationId', String(conversation.id))
    formData.set('text', inputText.trim())

    startTransition(async () => {
      const res = await sendReplyAction(formData)
      if (res.success) {
        setInputText('')
      } else {
        setErrorMsg(res.error || 'Error al enviar mensaje')
      }
    })
  }

  return (
    <section className="workspace-card" style={{ display: 'flex', flexDirection: 'column', height: '640px', minHeight: '500px' }}>
      {/* HEADER DE LA CONVERSACIÓN */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--workspace-border, #1a1a1a)',
          background: 'var(--workspace-surface, #090909)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{contactName}</h2>
            {crmLink && (
              <Link
                href={crmLink}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.75rem',
                  color: 'var(--workspace-accent, #00ffaa)',
                  textDecoration: 'none',
                }}
              >
                Ficha CRM <ArrowUpRight size={13} />
              </Link>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--workspace-muted, #777)', marginTop: '2px' }}>
            {conversation.contactAddress} · Canal: {conversation.channel}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isWindowActive ? (
            <span
              className="workspace-badge"
              style={{
                background: 'rgba(0, 255, 170, 0.1)',
                color: 'var(--workspace-accent, #00ffaa)',
                borderColor: 'rgba(0, 255, 170, 0.2)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <CheckCircle2 size={12} /> Ventana 24h activa
            </span>
          ) : (
            <span
              className="workspace-badge"
              data-tone="danger"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <Clock size={12} /> Fuera de ventana 24h
            </span>
          )}
          <Link
            className="workspace-button"
            href={`/admin/collections/conversations/${conversation.id}`}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir en Payload Admin"
          >
            <ExternalLink size={14} />
          </Link>
        </div>
      </header>

      {/* HISTORIAL DE MENSAJES */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          background: 'var(--workspace-bg, #050505)',
        }}
      >
        {messages.length === 0 ? (
          <div className="workspace-empty" style={{ margin: 'auto' }}>
            <MessageSquare size={24} />
            <p>No hay mensajes registrados aún en esta conversación.</p>
          </div>
        ) : (
          messages.map((m) => {
            const isInbound = m.direction === 'inbound'
            const msgDate = m.sentAt ? new Date(m.sentAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : ''
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignSelf: isInbound ? 'flex-start' : 'flex-end',
                  maxWidth: '75%',
                }}
              >
                <div
                  style={{
                    padding: '0.625rem 0.875rem',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    lineHeight: '1.4',
                    background: isInbound ? 'var(--workspace-raised, #161616)' : 'linear-gradient(135deg, #113322, #0d281a)',
                    color: isInbound ? 'var(--workspace-text, #fff)' : '#e0ffea',
                    border: isInbound ? '1px solid var(--workspace-border, #222)' : '1px solid rgba(0, 255, 170, 0.3)',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.text || (m.type !== 'text' ? `[Archivo ${m.type}]` : '—')}
                </div>
                <span
                  style={{
                    fontSize: '0.6875rem',
                    color: 'var(--workspace-muted, #666)',
                    marginTop: '2px',
                    alignSelf: isInbound ? 'flex-start' : 'flex-end',
                  }}
                >
                  {msgDate}
                </span>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* COMPOSER DE RESPUESTA */}
      <footer
        style={{
          padding: '0.875rem 1.25rem',
          borderTop: '1px solid var(--workspace-border, #1a1a1a)',
          background: 'var(--workspace-surface, #090909)',
        }}
      >
        {errorMsg && (
          <div
            style={{
              fontSize: '0.75rem',
              color: '#f87171',
              marginBottom: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <AlertCircle size={14} /> {errorMsg}
          </div>
        )}

        {!canEdit ? (
          <div style={{ fontSize: '0.8125rem', color: 'var(--workspace-muted, #777)', textAlign: 'center' }}>
            Modo solo lectura: requiere rol agente o admin para responder.
          </div>
        ) : !isWindowActive ? (
          <div
            style={{
              padding: '0.5rem 0.75rem',
              background: 'rgba(255, 170, 0, 0.08)',
              border: '1px solid rgba(255, 170, 0, 0.2)',
              borderRadius: '6px',
              fontSize: '0.75rem',
              color: '#ffaa00',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldAlert size={15} /> Han pasado más de 24h desde el último mensaje del cliente.
            </span>
            <Link
              href="/admin/collections/message-templates"
              style={{ color: '#fff', textDecoration: 'underline', fontWeight: 600 }}
            >
              Ver plantillas
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSend} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Escribe una respuesta para enviar por WhatsApp/Instagram..."
              disabled={isPending}
              style={{
                flex: 1,
                background: 'var(--workspace-bg, #050505)',
                border: '1px solid var(--workspace-border, #222)',
                borderRadius: '6px',
                padding: '0.5rem 0.75rem',
                color: '#fff',
                fontSize: '0.875rem',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={isPending || !inputText.trim()}
              className="workspace-button workspace-button-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.5rem 1rem' }}
            >
              <Send size={15} /> {isPending ? 'Enviando…' : 'Enviar'}
            </button>
          </form>
        )}
      </footer>
    </section>
  )
}
