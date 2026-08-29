import Link from 'next/link'
import { Inbox, MessageSquare, Plus } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import type { Conversation, Message } from '@/payload-types'
import { isWindowActiveServer } from './actions'
import { InboxChatView } from './components/InboxChatView'

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  whatsapp_web: 'WhatsApp Web',
  instagram_dm: 'Instagram DM',
}

const fmtDate = (v: string | null | undefined): string => {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10)
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ conv?: string; tenant?: string | string[] }>
}) {
  const params = await searchParams
  const context = await getWorkspaceContext(params)
  const { payload, user, tenantId, canEdit } = context

  const conversationsRes = await payload.find({
    collection: 'conversations',
    where: { tenant: { equals: tenantId } },
    depth: 1,
    limit: 50,
    sort: '-lastMessageAt',
    overrideAccess: false,
    user,
  })

  const conversations = conversationsRes.docs as Conversation[]

  const selectedId = params.conv ? Number(params.conv) : null
  const active =
    (selectedId && conversations.find((c) => c.id === selectedId)) ||
    conversations[0] ||
    null

  let messages: Message[] = []
  let isWindowActive = false

  if (active) {
    const [messagesRes, windowActive] = await Promise.all([
      payload.find({
        collection: 'messages',
        where: {
          and: [
            { conversation: { equals: active.id } },
            { tenant: { equals: tenantId } },
          ],
        },
        limit: 100,
        sort: 'sentAt',
        overrideAccess: false,
        user,
      }),
      isWindowActiveServer(active.lastInboundAt),
    ])

    messages = messagesRes.docs as Message[]
    isWindowActive = windowActive
  }

  return (
    <div className="workspace-page">
      <section className="workspace-page-head">
        <div>
          <div className="workspace-eyebrow">
            <span className="workspace-eyebrow-dot" /> Mensajería omnicanal
          </div>
          <h1 className="workspace-title">Unified Inbox</h1>
          <p className="workspace-subtitle">
            Conversaciones de WhatsApp e Instagram sincronizadas con OpenBSP para {context.tenant.name}.
          </p>
        </div>
        <div className="workspace-actions">
          <Link className="workspace-button" href="/crm">
            Ver CRM
          </Link>
          <Link className="workspace-button workspace-button-primary" href="/admin/collections/conversations">
            <Plus size={16} /> Abrir en Admin
          </Link>
        </div>
      </section>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(20rem, 0.85fr) minmax(0, 1.55fr)',
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        {/* LISTA DE CONVERSACIONES */}
        <section className="workspace-card" style={{ overflow: 'hidden', height: '640px', display: 'flex', flexDirection: 'column' }}>
          <header className="workspace-card-head" style={{ padding: '1rem 1.25rem' }}>
            <div>
              <h2 className="workspace-card-title">Conversaciones</h2>
              <p className="workspace-card-description">{conversationsRes.totalDocs} activas en este tenant.</p>
            </div>
            <Inbox size={18} />
          </header>
          <div className="workspace-card-body" style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
            {conversations.length === 0 ? (
              <div className="workspace-empty">
                Sin conversaciones sincronizadas todavía. Los mensajes entrantes de OpenBSP aparecerán aquí automáticamente.
              </div>
            ) : (
              <div className="workspace-list" style={{ gap: '0.25rem' }}>
                {conversations.map((conv) => {
                  const isSelected = active?.id === conv.id
                  const client = conv.client && typeof conv.client === 'object' ? conv.client : null
                  const lead = conv.lead && typeof conv.lead === 'object' ? conv.lead : null
                  const contactName =
                    (client && 'name' in client ? (client as { name?: string }).name : null) ||
                    (lead && 'fullName' in lead ? (lead as { fullName?: string }).fullName : null) ||
                    conv.contactAddress
                  const kind = client ? 'Cliente' : lead ? 'Lead' : 'Contacto'

                  return (
                    <Link
                      key={conv.id}
                      className="workspace-list-row"
                      data-active={isSelected ? 'true' : undefined}
                      style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '6px',
                        background: isSelected ? 'var(--workspace-raised, #161616)' : 'transparent',
                        border: isSelected ? '1px solid var(--workspace-border, #333)' : '1px solid transparent',
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                      href={`/inbox?conv=${conv.id}`}
                    >
                      <div className="workspace-list-copy">
                        <strong style={{ fontSize: '0.875rem' }}>{contactName}</strong>
                        <span style={{ fontSize: '0.75rem', color: 'var(--workspace-muted, #777)' }}>
                          {kind} · {CHANNEL_LABEL[conv.channel] ?? conv.channel} · {fmtDate(conv.lastMessageAt)}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {/* DETALLE Y CHAT VIEW */}
        {active ? (
          <InboxChatView
            conversation={active}
            messages={messages}
            canEdit={canEdit}
            isWindowActive={isWindowActive}
          />
        ) : (
          <section className="workspace-card" style={{ height: '640px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="workspace-drawer-copy">
              <div>
                <MessageSquare size={32} />
                <strong>Sin conversación seleccionada</strong>
                <p>Selecciona una conversación del panel izquierdo para ver el historial y responder.</p>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
