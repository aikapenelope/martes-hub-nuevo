'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Camera, Globe, Loader2, MessageCircle, Plus, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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

  // Búsqueda en servidor acotada estrictamente al query activo para evitar carreras entre búsquedas (revisión Devin PR #80)
  const activeQueryRef = useRef(searchTerm.trim())
  const [searchState, setSearchState] = useState<{
    query: string
    contacts: ContactItem[]
    page: number
    hasMore: boolean
    total: number | null
  } | null>(null)
  const [isSearchingServer, setIsSearchingServer] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    const q = searchTerm.trim()
    activeQueryRef.current = q

    if (!q) return

    let cancelled = false
    const timer = setTimeout(() => {
      setIsSearchingServer(true)
      searchInboxCrmContactsAction({ q, page: 1 })
        .then((res) => {
          if (!cancelled && activeQueryRef.current === q) {
            setIsSearchingServer(false)
            if (res.ok) {
              setSearchState({
                query: q,
                contacts: res.results,
                page: 1,
                hasMore: res.hasMore,
                total: res.total,
              })
            }
          }
        })
        .catch(() => {
          if (!cancelled && activeQueryRef.current === q) {
            setIsSearchingServer(false)
          }
        })
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchTerm])

  const handleLoadMore = () => {
    const q = activeQueryRef.current
    if (!q || !searchState || searchState.query !== q || !searchState.hasMore || loadingMore) return
    const nextPage = searchState.page + 1
    setLoadingMore(true)
    searchInboxCrmContactsAction({ q, page: nextPage })
      .then((res) => {
        if (activeQueryRef.current !== q) return
        setLoadingMore(false)
        if (res.ok) {
          setSearchState((prev) => {
            if (!prev || prev.query !== q) return prev
            return {
              query: q,
              contacts: [...prev.contacts, ...res.results],
              page: nextPage,
              hasMore: res.hasMore,
              total: res.total,
            }
          })
        }
      })
      .catch(() => {
        if (activeQueryRef.current === q) {
          setLoadingMore(false)
        }
      })
  }

  // Filtro combinado de contactos del CRM acotado al query actual
  const displayedContacts = useMemo(() => {
    const q = searchTerm.trim()
    if (!q) return contacts.slice(0, 15)
    if (searchState && searchState.query === q) return searchState.contacts
    const lowerQ = q.toLowerCase()
    return contacts
      .filter(
        (c) =>
          c.name.toLowerCase().includes(lowerQ) ||
          (c.company && c.company.toLowerCase().includes(lowerQ)) ||
          (c.phone && c.phone.includes(lowerQ)) ||
          (c.email && c.email.toLowerCase().includes(lowerQ)),
      )
      .slice(0, 20)
  }, [contacts, searchTerm, searchState])

  const serverHasMore = Boolean(
    searchState && searchState.query === searchTerm.trim() && searchState.hasMore,
  )
  const serverTotal =
    searchState && searchState.query === searchTerm.trim() ? searchState.total : null

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
    setSearchState(null)
    activeQueryRef.current = ''
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
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          handleReset()
          onClose()
        }
      }}
    >
      <SheetContent
        side="right"
        className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
      >
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle className="text-sm font-bold uppercase tracking-wider text-foreground truncate">
            Iniciar Conversación · Consola Omnicanal
          </SheetTitle>
          <SheetDescription className="sr-only">
            Inicia un hilo con un contacto del CRM o con un número manual
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col overflow-y-auto p-4">
          <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs">
            {error && (
              <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs">
                {error}
              </div>
            )}

            {/* Modo de Destinatario */}
            <div className="flex border border-border bg-background p-0.5">
              <button
                type="button"
                onClick={() => {
                  setMode('crm')
                  setError(null)
                }}
                className={`flex-1 py-1.5 uppercase font-bold text-center transition ${
                  mode === 'crm'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
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
                  mode === 'custom'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Número Manual
              </button>
            </div>

            {/* Búsqueda y Selección en CRM */}
            {mode === 'crm' && (
              <div className="space-y-2">
                {selectedContact ? (
                  <div className="p-3 bg-muted border border-border flex items-center justify-between">
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
                        <strong className="text-foreground text-sm">{selectedContact.name}</strong>
                      </div>
                      {selectedContact.company && (
                        <span className="text-[11px] text-muted-foreground block">
                          {selectedContact.company}
                        </span>
                      )}
                      {selectedContact.phone && (
                        <span className="text-[10px] text-emerald-400 font-mono block mt-0.5">
                          Tel: {selectedContact.phone}
                        </span>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setSelectedContact(null)}
                      title="Cambiar contacto"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">
                      Buscar Cliente o Prospecto
                    </span>
                    <div className="relative">
                      <Search
                        size={13}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Nombre, empresa, teléfono..."
                        className="w-full border border-input bg-transparent pl-8 pr-8 py-1.5 text-xs text-foreground focus:outline-none focus:border-ring dark:bg-input/30"
                      />
                      {isSearchingServer && Boolean(searchTerm.trim()) && (
                        <Loader2
                          size={12}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin"
                        />
                      )}
                    </div>

                    <div className="max-h-48 overflow-y-auto border border-border divide-y divide-border bg-background">
                      {displayedContacts.length === 0 ? (
                        <p className="p-3 text-[11px] text-muted-foreground text-center">
                          No se encontraron contactos en el CRM.
                        </p>
                      ) : (
                        displayedContacts.map((c) => (
                          <button
                            key={`${c.kind}-${c.id}`}
                            type="button"
                            onClick={() => handleSelectContact(c)}
                            className="w-full p-2 text-left hover:bg-muted transition flex items-center justify-between"
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
                                <span className="text-foreground font-bold">{c.name}</span>
                              </div>
                              {c.company && (
                                <span className="text-[10px] text-muted-foreground block">
                                  {c.company}
                                </span>
                              )}
                            </div>
                            {c.phone ? (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {c.phone}
                              </span>
                            ) : (
                              <span className="text-[9px] text-amber-400/80">Sin tel</span>
                            )}
                          </button>
                        ))
                      )}
                      {serverHasMore && (
                        <Button
                          type="button"
                          disabled={loadingMore}
                          onClick={handleLoadMore}
                          className="w-full rounded-none border-t border-border bg-muted py-2 font-mono text-[10px] font-bold uppercase text-foreground/80 hover:bg-accent hover:text-foreground"
                        >
                          {loadingMore ? <Loader2 className="size-3 animate-spin" /> : null}
                          <span>
                            {loadingMore
                              ? 'Cargando más contactos...'
                              : `Cargar más (${displayedContacts.length} de ${serverTotal ?? 'más'})`}
                          </span>
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Entrada Manual de Número */}
            {(mode === 'custom' || (selectedContact && !selectedContact.phone)) && (
              <label className="flex flex-col gap-1 text-[10px] text-muted-foreground uppercase">
                <span>
                  Número de Contacto (E.164 sin +) <span className="text-rose-400">*</span>
                </span>
                <input
                  type="text"
                  value={customAddress}
                  onChange={(e) => setCustomAddress(e.target.value)}
                  placeholder="Ej: 584121234567 o usuario_instagram"
                  required
                  className="border border-input bg-transparent px-3 py-2 text-xs text-foreground focus:outline-none focus:border-ring font-mono dark:bg-input/30"
                />
              </label>
            )}

            {/* Canal de Salida */}
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase font-bold block">
                Canal
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  {
                    id: 'whatsapp',
                    label: 'WhatsApp',
                    icon: MessageCircle,
                    color: 'text-emerald-400',
                  },
                  {
                    id: 'instagram_dm',
                    label: 'Instagram',
                    icon: Camera,
                    color: 'text-purple-400',
                  },
                  { id: 'web', label: 'Web Chat', icon: Globe, color: 'text-sky-400' },
                ].map(({ id, label, icon: Icon, color }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setChannel(id as typeof channel)}
                    className={`p-2 border text-center transition flex flex-col items-center gap-1 ${
                      channel === id
                        ? 'border-foreground bg-muted text-foreground font-bold'
                        : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <Icon size={14} className={channel === id ? 'text-foreground' : color} />
                    <span className="text-[10px]">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Prioridad */}
            <label className="flex flex-col gap-1 text-[10px] text-muted-foreground uppercase">
              <span>Prioridad Inicial</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as typeof priority)}
                className="border border-input bg-transparent px-3 py-2 text-xs text-foreground focus:outline-none focus:border-ring font-mono dark:bg-input/30"
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </label>

            {/* Mensaje Inicial Opcional */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground uppercase font-bold">
                  Primer Mensaje (Opcional)
                </span>
                <div className="flex items-center gap-1">
                  {DEFAULT_QUICK_SNIPPETS.slice(0, 2).map((s) => (
                    <Button
                      key={s.id}
                      type="button"
                      variant="link"
                      onClick={() => setInitialMessage(s.text)}
                      className="h-auto p-0 text-[9px] font-mono text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      {s.shortcut}
                    </Button>
                  ))}
                </div>
              </div>
              <textarea
                value={initialMessage}
                onChange={(e) => setInitialMessage(e.target.value)}
                rows={3}
                placeholder="Escribe el mensaje que se enviará al abrir el hilo..."
                className="w-full border border-input bg-transparent p-2.5 text-xs text-foreground focus:outline-none focus:border-ring resize-none font-sans dark:bg-input/30"
              />
            </div>

            {/* Botones de Acción */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  handleReset()
                  onClose()
                }}
                className="px-4 border-transparent bg-muted text-foreground/80 font-mono text-xs font-bold uppercase hover:bg-accent hover:text-foreground"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="px-5 font-mono text-xs font-black uppercase tracking-wider shadow-lg shadow-black/50"
              >
                {isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                <span>Abrir Hilo</span>
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
