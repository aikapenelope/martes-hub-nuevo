'use client'

/**
 * CrmLeadDrawer — Ficha 360° del lead, montada dentro del `Drawer` lateral
 * que abre `CrmPipelineWorkspace` al hacer clic en una tarjeta del Kanban.
 * Carga sus datos vía la REST API nativa de Payload con credentials incluidas.
 *
 * Arquitectura modular:
 * - LeadDrawerWhatsAppTab: Chat en vivo y respuestas rápidas.
 * - LeadDrawerEmailTab: Envíos transaccionales por Resend e histórico de logs.
 * - LeadDrawerAiTab: Copiloto IA (resúmenes y detección de sentimiento/objeciones).
 * - LeadDrawerTimelineTab: Línea de tiempo de actividades.
 * - LeadDrawerDataTab: Formulario de edición rápida de campos comerciales.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Clock3, ExternalLink, Mail, MessageCircle, Pencil, Sparkles } from 'lucide-react'

import type { Activity, Lead, Segment, User } from '@/payload-types'
import type { LeadDrawerData, TabKey } from './lead-drawer/types'
import { LeadDrawerWhatsAppTab } from './lead-drawer/LeadDrawerWhatsAppTab'
import { LeadDrawerEmailTab } from './lead-drawer/LeadDrawerEmailTab'
import { LeadDrawerAiTab } from './lead-drawer/LeadDrawerAiTab'
import { LeadDrawerTimelineTab } from './lead-drawer/LeadDrawerTimelineTab'
import { LeadDrawerDataTab } from './lead-drawer/LeadDrawerDataTab'

const TABS: { key: TabKey; label: string; icon: typeof Mail }[] = [
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'ai', label: 'Copiloto IA', icon: Sparkles },
  { key: 'timeline', label: 'Timeline', icon: Clock3 },
  { key: 'datos', label: 'Datos CRM', icon: Pencil },
]

export function CrmLeadDrawer({
  leadId,
  canEdit,
  assignees = [],
  segments = [],
  onUpdated,
}: {
  leadId: number
  canEdit: boolean
  assignees?: User[]
  segments?: Segment[]
  onUpdated?: () => void
}) {
  const [tab, setTab] = useState<TabKey>('whatsapp')
  const [data, setData] = useState<LeadDrawerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Se incrementa al guardar en "Datos CRM" para volver a traer la ficha: sin
  // esto el snapshot local queda obsoleto y re-visitar la pestaña muestra (y
  // puede re-guardar) valores viejos.
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true

    async function load(): Promise<void> {
      try {
        const [leadRes, activitiesRes] = await Promise.all([
          fetch(`/api/leads/${leadId}?depth=1`, { credentials: 'include' }),
          fetch(`/api/activities?depth=1&limit=25&sort=-occurredAt&where[lead][equals]=${leadId}`, {
            credentials: 'include',
          }),
        ])
        if (!leadRes.ok) throw new Error('No se pudo cargar el lead')
        const lead = (await leadRes.json()) as Lead
        const activitiesJson = (await activitiesRes.json()) as { docs: Activity[] }
        if (active) setData({ lead, activities: activitiesJson.docs })
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Error cargando la ficha')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [leadId, reloadToken])

  return (
    <div className="flex h-full flex-col gap-3">
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-zinc-800 pb-2" aria-label="Secciones de la ficha">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            id={`lead-tab-${key}`}
            role="tab"
            type="button"
            onClick={() => setTab(key)}
            aria-selected={tab === key}
            aria-controls={`lead-panel-${key}`}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider transition ${
              tab === key ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Icon size={12} aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      {loading && <p className="text-xs font-mono text-zinc-500">Cargando ficha…</p>}
      {error && (
        <div className="border border-red-800 bg-red-900/30 px-3 py-2 text-xs text-red-300" role="alert">
          {error}
        </div>
      )}

      {data && !loading && (
        <div id={`lead-panel-${tab}`} role="tabpanel" aria-labelledby={`lead-tab-${tab}`} className="flex-1 overflow-y-auto">
          <div className="mb-2 flex justify-end">
            <Link
              href={`/workspace/crm/leads/${leadId}`}
              className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400 hover:text-white"
            >
              <ExternalLink size={11} aria-hidden="true" /> Ficha completa + timeline unificado
            </Link>
          </div>
          {tab === 'datos' && (
            <LeadDrawerDataTab
              lead={data.lead}
              canEdit={canEdit}
              assignees={assignees}
              segments={segments}
              onSaved={() => {
                // Refresca la ficha local + los server components del dashboard
                setReloadToken((t) => t + 1)
                onUpdated?.()
              }}
            />
          )}
          {tab === 'timeline' && (
            <LeadDrawerTimelineTab
              leadId={leadId}
              activities={data.activities}
              canEdit={canEdit}
              onActivityAdded={() => {
                setReloadToken((t) => t + 1)
                onUpdated?.()
              }}
            />
          )}
          {tab === 'whatsapp' && <LeadDrawerWhatsAppTab leadId={leadId} canEdit={canEdit} />}
          {tab === 'email' && <LeadDrawerEmailTab leadId={leadId} email={data.lead.email} canEdit={canEdit} />}
          {tab === 'ai' && <LeadDrawerAiTab leadId={leadId} canEdit={canEdit} />}
        </div>
      )}
    </div>
  )
}
