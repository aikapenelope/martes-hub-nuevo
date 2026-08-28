import Link from 'next/link'
import { Inbox, MessageSquare, MessageSquareText } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'

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
  searchParams: Promise<{ tenant?: string | string[] }>
}) {
  const params = await searchParams
  const context = await getWorkspaceContext(params)
  const { payload, user, tenantId } = context

  const conversations = await payload.find({
    collection: 'conversations',
    where: { tenant: { equals: tenantId } },
    depth: 1,
    limit: 50,
    sort: '-lastMessageAt',
    overrideAccess: false,
    user,
  })

  const active = conversations.docs[0]

  return (
    <div className="workspace-page">
      <section className="workspace-page-head">
        <div>
          <div className="workspace-eyebrow"><span className="workspace-eyebrow-dot" /> Mensajería omnicanal</div>
          <h1 className="workspace-title">Unified Inbox</h1>
          <p className="workspace-subtitle">Conversaciones de WhatsApp e Instagram sincronizadas con OpenBSP.</p>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(22rem, 0.8fr) minmax(0, 1.6fr)', gap: '1rem', alignItems: 'start' }}>
        <section className="workspace-card" style={{ overflow: 'hidden' }}>
          <header className="workspace-card-head">
            <div><h2 className="workspace-card-title">Conversaciones</h2><p className="workspace-card-description">{conversations.totalDocs} activas en {context.tenant.name}.</p></div>
            <Inbox size={18} />
          </header>
          <div className="workspace-card-body">
            {conversations.docs.length === 0 ? (
              <div className="workspace-empty">Sin conversaciones sincronizadas todavía. Los mensajes entrantes de OpenBSP aparecen aquí.</div>
            ) : (
              <div className="workspace-list">
                {conversations.docs.map((conv, idx) => {
                  const client = conv.client && typeof conv.client === 'object' ? conv.client : null
                  const lead = conv.lead && typeof conv.lead === 'object' ? conv.lead : null
                  const contactName =
                    (client && 'name' in client ? (client as { name?: string }).name : null) ||
                    (lead && 'fullName' in lead ? (lead as { fullName?: string }).fullName : null) ||
                    conv.contactAddress
                  const kind = client ? 'Cliente' : lead ? 'Lead' : 'Contacto'
                  return (
                    <Link
                      className="workspace-list-row"
                      data-active={idx === 0 ? 'true' : undefined}
                      style={idx === 0 ? { background: 'var(--workspace-raised)' } : undefined}
                      href={`/admin/collections/conversations/${conv.id}`}
                      key={conv.id}
                    >
                      <div className="workspace-list-copy">
                        <strong>{contactName}</strong>
                        <span>{kind} · {CHANNEL_LABEL[conv.channel] ?? conv.channel} · último {fmtDate(conv.lastMessageAt)}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        <section className="workspace-card" style={{ minHeight: '24rem' }}>
          {active ? (
            <>
              <header className="workspace-card-head">
                <div>
                  <h2 className="workspace-card-title">{active.contactAddress}</h2>
                  <p className="workspace-card-description">Última actividad: {fmtDate(active.lastMessageAt)}</p>
                </div>
                <Link className="workspace-button" href={`/admin/collections/conversations/${active.id}`}>Ver conversación</Link>
              </header>
              <div className="workspace-drawer-copy" style={{ height: '100%' }}>
                <div>
                  <MessageSquareText size={28} />
                  <strong>{active.contactAddress}</strong>
                  <p>El historial de mensajes se sincroniza con OpenBSP. Responde desde el admin de Payload respetando la ventana de 24h (o con plantillas aprobadas).</p>
                </div>
              </div>
            </>
          ) : (
            <div className="workspace-drawer-copy" style={{ height: '100%' }}>
              <div>
                <MessageSquare size={28} />
                <strong>Sin conversación seleccionada</strong>
                <p>Selecciona una conversación para ver su detalle y responder.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}