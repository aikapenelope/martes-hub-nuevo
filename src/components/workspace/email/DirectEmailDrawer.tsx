'use client'

import { useState, useTransition } from 'react'
import { Send, Users, Contact } from 'lucide-react'
import { sendDirectEmailAction } from '@/lib/email-direct-actions'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { Lead, Client } from '@/payload-types'

/* Campos nativos (select con option vacío no puede ser Select Radix: regla Devin #2). */
const fieldCls =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function DirectEmailDrawer({ leads, clients }: { leads: Lead[], clients: Client[] }) {
  const [open, setOpen] = useState(false)
  const [recipientType, setRecipientType] = useState<'lead'|'client'>('lead')
  const [isPending, startTransition] = useTransition()

  async function handleAction(formData: FormData) {
    startTransition(async () => {
      try {
        await sendDirectEmailAction(formData)
        setOpen(false)
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Error enviando el correo')
      }
    })
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} className="font-mono text-xs font-bold uppercase tracking-wider">
        <Send className="size-3.5" /> Redactar 1:1
      </Button>

      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) setOpen(false)
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
              Enviar Correo Directo
            </SheetTitle>
            <SheetDescription className="sr-only">
              Redacta y envía un correo 1:1 a un lead o cliente del CRM.
            </SheetDescription>
          </SheetHeader>

          <form action={handleAction} className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">

            <div className="flex gap-2 rounded border border-border bg-muted/50 p-1">
              <button
                type="button"
                onClick={() => setRecipientType('lead')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 font-mono text-[10px] uppercase tracking-wider transition ${recipientType === 'lead' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground/80'}`}
              >
                <Contact size={12} /> Prospectos (Leads)
              </button>
              <button
                type="button"
                onClick={() => setRecipientType('client')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 font-mono text-[10px] uppercase tracking-wider transition ${recipientType === 'client' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground/80'}`}
              >
                <Users size={12} /> Clientes Activos
              </button>
            </div>

            <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Destinatario ({recipientType === 'lead' ? 'Lead' : 'Cliente'})
              <select name="recipientId" required className={fieldCls}>
                <option value="" disabled selected>Selecciona un destinatario...</option>
                {recipientType === 'lead' ? leads.map(l => (
                  <option key={l.id} value={`lead_${l.id}`}>{l.fullName} ({l.email})</option>
                )) : clients.map(c => (
                  <option key={c.id} value={`client_${c.id}`}>{c.name} ({c.email})</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Asunto
              <input name="subject" required className={fieldCls} />
            </label>

            <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-muted-foreground flex-1">
              Mensaje (Markdown soportado)
              <textarea name="body" rows={8} required className={`${fieldCls} h-full resize-none font-sans`} />
            </label>

            <div className="mt-auto flex justify-end gap-2 border-t border-border pt-4">
              {/* type="button": sin él, Cancelar haría submit del form (review Devin). */}
              <Button type="button" variant="outline" className="bg-muted font-mono text-xs font-bold uppercase tracking-wider text-foreground/80 hover:bg-accent hover:text-foreground">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-sky-500 font-mono text-xs font-bold uppercase tracking-wider text-white hover:bg-sky-400"
              >
                {isPending ? 'Enviando...' : 'Enviar Mensaje'}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </>
  )
}
