'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  Camera,
  Globe,
  Loader2,
  MessageCircle,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { Drawer } from '@/components/workspace/overlays'
import {
  createConversationAction,
  searchInboxCrmContactsAction,
  type ContactItem,
} from '@/lib/inbox-actions'
import { DEFAULT_QUICK_SNIPPETS } from './inbox-snippets'

export type { ContactItem }

interface NewConversationDrawerProps {
  open: boolean
  onClose: () => void
  contacts: ContactItem[]
  onConversationCreated: (conversationId: number) => void
}

export function NewConversationDrawer({
  open,
  onClose,
  contacts,
  onConversationCreated,
}: NewConversationDrawerProps) {
  const [mode, setMode] = useState<'crm' | 'custom'>('crm')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedContact, setSelectedContact] = useState<ContactItem | null>(null)
  const [customAddress, setCustomAddress] = useState('')
  const [channel, setChannel] = useState<'whatsapp' | 'instagram_dm' | 'web'>('whatsapp')
  const [priority, setPriority] = useState<'baja' | 'media' | 'alta'>('media')
  const [initialMessage, setInitialMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Búsqueda en servidor con debouncing para no limitar a los primeros 100 registros (revisión Devin PR #80)
  const [serverContacts, setServerContacts] = useState<ContactItem[] | null>(null)
  const [isSearchingServer, setIsSearchingServer] = useState(false)

  useEffect(() => {
    const q = searchTerm.trim()
    if (!q) {
      return
    }

    let cancelled = false
    const timer = setTimeout(() => {
      setIsSearchingServer(true)
      searchInboxCrmContactsAction({ q })
        .then((res) => {
          if (!cancelled) {
            setIsSearchingServer(false)
            if (res.ok) {
              setServerContacts(res.results)
            }
          }
        })
        .catch(() => {
          if (!cancelled) setIsSearchingServer(false)
        })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchTerm])

  // Filtro combinado de contactos del CRM
  const displayedContacts = useMemo(() => {
    if (!searchTerm.trim()) return contacts.slice(0, 15)
    if (serverContacts !== null) return serverContacts
    const q = searchTerm.toLowerCase()
    return contacts
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.company && c.company.toLowerCase().includes(q)) ||
          (c.phone && c.phone.includes(q)) ||
          (c.email && c.email.toLowerCase().includes(q)),
      )
      .slice(0, 20)
  }, [contacts, searchTerm, serverContacts])

  const handleSelectContact = (c: ContactItem) => {
    setSelectedContact(c)
    if (c.phone) {
      setCustomAddress(c.phone.replace(/\D/g, ''))
    }
  }

  const handleReset = () => {
    setSearchTerm('')
    setSelectedContact(null)
    setCustomAddress('')
    setInitialMessage('')
    setError(null)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const address = (selectedContact?.phone || customAddress).trim().replace(/^\+/, '')
    if (!address) {
      setError('Por favor indica un número de teléfono o identificador de contacto')
      return
    }

    startTransition(async () => {
      const res = await createConversationAction({
        contactAddress: address,
        channel: channel === 'web' ? 'whatsapp_web' : channel,
        clientId: selectedContact?.kind === 'client' ? selectedContact.id : null,
        leadId: selectedContact?.kind === 'lead' ? selectedContact.id : null,
        priority,
        initialMessage: initialMessage.trim() || undefined,
      })

      if (!res.ok) {
        setError(res.error || 'Error al iniciar la conversación')
      } else {
        handleReset()
        onClose()
        onConversationCreated(res.conversationId)
      }
    })
  }

  return (
    <Drawer
      open={open}
      onClose={() => {
        handleReset()
        onClose()
      }}
      size="md"
      title="Iniciar Conversación · Consola Omnicanal"
    >
      <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs">
        {error && (
          <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs">
            {error}
          </div>
        )}

        {/* Modo de Destinatario */}
        <div className="flex border border-zinc-800 bg-black p-0.5">
          <button
            type="button"
            onClick={() => {
              setMode('crm')
              setError(null)
            }}
            className={`flex-1 py-1.5 uppercase font-bold text-center transition ${
              mode === 'crm' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Contacto CRM
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('custom')
              setSelectedContact(null)
              setError(null)
            }}
            className={`flex-1 py-1.5 uppercase font-bold text-center transition ${
              mode === 'custom' ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Número Manual
          </button>
        </div>

        {/* Búsqueda y Selección en CRM */}
        {mode === 'crm' && (
          <div className="space-y-2">
            {selectedContact ? (
              <div className="p-3 bg-zinc-900 border border-zinc-700 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[9px] uppercase px-1 py-0.2 font-bold ${
                        selectedContact.kind === 'client'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-sky-950 text-sky-300 border border-sky-800'
                      }`}
                    >
                      {selectedContact.kind === 'client' ? 'Cliente' : 'Prospecto'}
                    </span>
                    <strong className="text-white text-sm">{selectedContact.name}</strong>
                  </div>
                  {selectedContact.company && (
                    <span className="text-[11px] text-zinc-400 block">{selectedContact.company}</span>
                  )}
                  {selectedContact.phone && (
                    <span className="text-[10px] text-emerald-400 font-mono block mt-0.5">
                      Tel: {selectedContact.phone}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedContact(null)}
                  className="p-1 text-zinc-400 hover:text-white"
                  title="Cambiar contacto"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <span className="text-[10px] text-zinc-400 uppercase font-bold">
                  Buscar Cliente o Prospecto
                </span>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Nombre, empresa, teléfono..."
                    className="w-full bg-black border border-zinc-800 pl-8 pr-8 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-600"
                  />
                  {isSearchingServer && (
                    <Loader2 size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 animate-spin" />
                  )}
                </div>

                <div className="max-h-48 overflow-y-auto border border-zinc-850 divide-y divide-zinc-900 bg-zinc-950">
                  {displayedContacts.length === 0 ? (
                    <p className="p-3 text-[11px] text-zinc-500 text-center">
                      No se encontraron contactos en el CRM.
                    </p>
                  ) : (
                    displayedContacts.map((c) => (
                      <button
                        key={`${c.kind}-${c.id}`}
                        type="button"
                        onClick={() => handleSelectContact(c)}
                        className="w-full p-2 text-left hover:bg-zinc-900 transition flex items-center justify-between"
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[8px] uppercase px-1 py-0.2 ${
                                c.kind === 'client'
                                  ? 'bg-emerald-950/80 text-emerald-300'
                                  : 'bg-sky-950/80 text-sky-300'
                              }`}
                            >
                              {c.kind === 'client' ? 'CLI' : 'LEAD'}
                            </span>
                            <span className="text-white font-bold">{c.name}</span>
                          </div>
                          {c.company && (
                            <span className="text-[10px] text-zinc-500 block">{c.company}</span>
                          )}
                        </div>
                        {c.phone ? (
                          <span className="text-[10px] text-zinc-400 font-mono">{c.phone}</span>
                        ) : (
                          <span className="text-[9px] text-amber-400/80">Sin tel</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Entrada Manual de Número */}
        {(mode === 'custom' || (selectedContact && !selectedContact.phone)) && (
          <label className="flex flex-col gap-1 text-[10px] text-zinc-400 uppercase">
            <span>Número de Contacto (E.164 sin +) <span className="text-rose-400">*</span></span>
            <input
              type="text"
              value={customAddress}
              onChange={(e) => setCustomAddress(e.target.value)}
              placeholder="Ej: 584121234567 o usuario_instagram"
              required
              className="bg-black border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600 font-mono"
            />
          </label>
        )}

        {/* Canal de Salida */}
        <div className="space-y-1">
          <span className="text-[10px] text-zinc-400 uppercase font-bold block">Canal</span>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: 'text-emerald-400' },
              { id: 'instagram_dm', label: 'Instagram', icon: Camera, color: 'text-purple-400' },
              { id: 'web', label: 'Web Chat', icon: Globe, color: 'text-sky-400' },
            ].map(({ id, label, icon: Icon, color }) => (
              <button
                key={id}
                type="button"
                onClick={() => setChannel(id as typeof channel)}
                className={`p-2 border text-center transition flex flex-col items-center gap-1 ${
                  channel === id
                    ? 'border-white bg-zinc-850 text-white font-bold'
                    : 'border-zinc-850 bg-black text-zinc-400 hover:text-white'
                }`}
              >
                <Icon size={14} className={channel === id ? 'text-white' : color} />
                <span className="text-[10px]">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Prioridad */}
        <label className="flex flex-col gap-1 text-[10px] text-zinc-400 uppercase">
          <span>Prioridad Inicial</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
            className="bg-black border border-zinc-800 px-3 py-2 text-xs text-white focus:outline-none focus:border-zinc-600 font-mono"
          >
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
          </select>
        </label>

        {/* Mensaje Inicial Opcional */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400 uppercase font-bold">
              Primer Mensaje (Opcional)
            </span>
            <div className="flex items-center gap-1">
              {DEFAULT_QUICK_SNIPPETS.slice(0, 2).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setInitialMessage(s.text)}
                  className="text-[9px] text-zinc-400 hover:text-white underline font-mono"
                >
                  {s.shortcut}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={initialMessage}
            onChange={(e) => setInitialMessage(e.target.value)}
            rows={3}
            placeholder="Escribe el mensaje que se enviará al abrir el hilo..."
            className="w-full bg-black border border-zinc-800 p-2.5 text-xs text-white focus:outline-none focus:border-zinc-600 resize-none font-sans"
          />
        </div>

        {/* Botones de Acción */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-900">
          <button
            type="button"
            onClick={() => {
              handleReset()
              onClose()
            }}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-bold uppercase transition font-mono"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5 disabled:opacity-50 font-mono shadow-lg shadow-zinc-950"
          >
            {isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={14} />}
            <span>Abrir Hilo</span>
          </button>
        </div>
      </form>
    </Drawer>
  )
}
