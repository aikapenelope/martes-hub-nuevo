'use client'

import { useEffect, useState, useTransition } from 'react'
import { Phone, Users, MessageSquare, Mail, StickyNote, Activity, Plus } from 'lucide-react'
import { Drawer } from '@/components/workspace/overlays'
import { createActivityAction } from '@/lib/crm-actions'
import { searchActivityContactsAction } from '@/lib/activity-contact-search'

const inputCls = 'w-full border border-zinc-800 bg-black px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 transition font-mono'
const labelCls = 'flex flex-col gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-400'

const ACTIVITY_TYPES = [
  { value: 'llamada', label: 'Llamada', icon: Phone, cls: 'text-sky-400 border-sky-800 bg-sky-950/50' },
  { value: 'reunion', label: 'Reunión', icon: Users, cls: 'text-amber-300 border-amber-800 bg-amber-950/50' },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, cls: 'text-emerald-400 border-emerald-800 bg-emerald-950/50' },
  { value: 'email', label: 'Email', icon: Mail, cls: 'text-indigo-400 border-indigo-800 bg-indigo-950/50' },
  { value: 'nota', label: 'Nota Interna', icon: StickyNote, cls: 'text-zinc-300 border-zinc-700 bg-zinc-900' },
  { value: 'otro', label: 'Otro', icon: Activity, cls: 'text-zinc-400 border-zinc-700 bg-zinc-900' },
] as const

type ActivityType = typeof ACTIVITY_TYPES[number]['value']

interface ContactOption {
  id: number
  label: string
}

interface ActivityDrawerProps {
  clientId?: number
  leadId?: number
  redirectTo?: string
  variant?: 'primary' | 'ghost'
  /**
   * Contactos del tenant para elegir destino cuando el drawer no está
   * anclado a un registro (p. ej. timeline global de /workspace/activities).
   * Activities exige un lead o un cliente — sin destino fijo ni selector,
   * todo envío falla.
   */
  leads?: ContactOption[]
  clients?: ContactOption[]
}

export function ActivityDrawer({
  clientId,
  leadId,
  redirectTo = '/workspace/activities',
  variant = 'ghost',
  leads = [],
  clients = [],
}: ActivityDrawerProps) {
  const needsContactPicker = !clientId && !leadId
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<ActivityType>('llamada')
  const [isPending, startTransition] = useTransition()

  // Búsqueda server-side de contactos: las opciones iniciales traen solo los
  // 100 más recientes del tenant; con esto el picker alcanza a todos.
  const [contactSearch, setContactSearch] = useState('')
  const [lastSearch, setLastSearch] = useState<{ query: string; leads: ContactOption[]; clients: ContactOption[] } | null>(null)
  const [isSearching, startSearching] = useTransition()

  useEffect(() => {
    if (!needsContactPicker) return
    const trimmed = contactSearch.trim()
    if (trimmed.length < 2) return
    const timer = setTimeout(() => {
      startSearching(async () => {
        try {
          const results = await searchActivityContactsAction(trimmed)
          setLastSearch({ query: trimmed, ...results })
        } catch {
          setLastSearch({ query: trimmed, leads: [], clients: [] })
        }
      })
    }, 250)
    return () => clearTimeout(timer)
  }, [contactSearch, needsContactPicker])

  const query = contactSearch.trim()
  const isSearchActive = query.length >= 2
  // Los resultados solo cuentan si corresponden a la query actual — así el
  // reset al borrar/vaciar la búsqueda es derivado, sin setState en el effect.
  const searchResults = lastSearch && lastSearch.query === query ? lastSearch : null
  const availableLeads = searchResults ? searchResults.leads : leads
  const availableClients = searchResults ? searchResults.clients : clients

  const btnCls = variant === 'primary'
    ? 'px-4 py-2 bg-white hover:bg-zinc-200 text-black font-black flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider transition'
    : 'inline-flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 hover:text-white px-2 py-1.5 border border-zinc-800 hover:border-zinc-600 bg-zinc-900 transition'

  async function handleAction(formData: FormData) {
    // El selector único de contacto se traduce a la relación `lead` o `client`
    // que espera createActivityAction (que valida que pertenezca al tenant).
    if (needsContactPicker) {
      const target = String(formData.get('target') ?? '')
      formData.delete('target')
      const [kind, id] = target.split('_')
      if (kind === 'lead' && id) formData.set('lead', id)
      else if (kind === 'client' && id) formData.set('client', id)
    }
    startTransition(async () => {
      try {
        await createActivityAction(formData)
        setOpen(false)
      } catch (err) {
        console.error(err)
        alert(err instanceof Error ? err.message : 'Error al guardar')
      }
    })
  }

  return (
    <>
      <button type="button" className={btnCls} onClick={() => setOpen(true)}>
        <Plus size={12} />
        <span>Registrar Actividad</span>
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} title="Registrar Actividad Comercial" size="lg">
        <div className="flex flex-col gap-5 pb-6">
          {/* Subheader */}
          <div className="border border-zinc-850 bg-zinc-900/40 p-3">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>CRM · Historial Comercial</span>
            </div>
            <p className="mt-1 text-xs text-zinc-300">Registra llamadas, reuniones, notas de contacto y WhatsApps directamente en la ficha del contacto.</p>
          </div>

          <form action={handleAction} className="flex flex-col gap-4">
            <input type="hidden" name="redirectTo" value={redirectTo} />
            {clientId && <input type="hidden" name="client" value={clientId} />}
            {leadId && <input type="hidden" name="lead" value={leadId} />}
            <input type="hidden" name="type" value={type} />

            {/* Selector de contacto cuando el drawer no está anclado a un registro */}
            {needsContactPicker && (
              <div className="border border-zinc-850 bg-zinc-950 p-3.5">
                <label className={labelCls}>
                  Buscar contacto (nombre, email o teléfono)
                  <input
                    type="search"
                    value={contactSearch}
                    onChange={(e) => setContactSearch(e.target.value)}
                    placeholder="Escribe 2+ caracteres para buscar en todo el CRM…"
                    className={inputCls}
                  />
                </label>
                <label className={`${labelCls} mt-3`}>
                  Vincular a contacto *
                  <select name="target" required defaultValue="" className={inputCls} key={isSearchActive ? 'search' : 'initial'}>
                    <option value="" disabled>
                      {isSearching ? 'Buscando…' : 'Selecciona un lead o cliente…'}
                    </option>
                    {availableLeads.length > 0 && (
                      <optgroup label="Leads">
                        {availableLeads.map((l) => (
                          <option key={`lead_${l.id}`} value={`lead_${l.id}`}>
                            {l.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {availableClients.length > 0 && (
                      <optgroup label="Clientes">
                        {availableClients.map((c) => (
                          <option key={`client_${c.id}`} value={`client_${c.id}`}>
                            {c.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </label>
                {availableLeads.length === 0 && availableClients.length === 0 && (
                  <p className="mt-2 text-[11px] font-mono text-amber-400">
                    {isSearchActive
                      ? `Sin resultados para «${query}» — prueba con otro nombre, email o teléfono.`
                      : 'No hay leads ni clientes en este tenant — crea uno en el CRM antes de registrar actividades.'}
                  </p>
                )}
              </div>
            )}

            {/* Tipo de Actividad */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">Tipo de Actividad</span>
              <div className="grid grid-cols-3 gap-1.5">
                {ACTIVITY_TYPES.map((t) => {
                  const Icon = t.icon
                  const isSelected = type === t.value
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setType(t.value)}
                      className={`flex items-center justify-center gap-1.5 px-2 py-2 text-[10px] font-mono border transition-all ${
                        isSelected
                          ? `${t.cls} ring-1 ring-white/20 font-bold`
                          : 'border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      <Icon size={12} />
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Descripción */}
            <div className="border border-zinc-850 bg-zinc-950 p-3.5 flex flex-col gap-3">
              <label className={labelCls}>
                Resumen de la actividad *
                <textarea
                  name="summary"
                  required
                  rows={4}
                  maxLength={500}
                  placeholder={type === 'llamada' ? 'Ej: Llamada de 15 min. El cliente confirmó interés en el plan Premium...' : type === 'reunion' ? 'Ej: Reunión de onboarding. Se acordaron los entregables...' : 'Notas de la actividad...'}
                  className={inputCls}
                  autoFocus
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className={labelCls}>
                  Fecha y hora
                  <input
                    name="occurredAt"
                    type="datetime-local"
                    defaultValue={new Date().toISOString().slice(0, 16)}
                    className={inputCls}
                  />
                </label>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-zinc-800/80 pt-4 mt-2">
              <p className="text-[11px] font-mono text-zinc-500">Se guardará en el historial del contacto.</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-bold uppercase tracking-wider transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-bold uppercase tracking-wider transition inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Plus size={14} />
                  {isPending ? 'Guardando...' : 'Guardar Actividad'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </Drawer>
    </>
  )
}
