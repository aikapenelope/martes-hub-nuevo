'use client'

import { useState, useTransition } from 'react'
import { Send, Users, Contact } from 'lucide-react'
import { Drawer } from '@/components/workspace/overlays'
import { sendDirectEmailAction } from '@/lib/email-direct-actions'
import type { Lead, Client } from '@/payload-types'

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
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono hover:bg-zinc-200 transition inline-flex items-center gap-2"
      >
        <Send size={14} /> Redactar 1:1
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Enviar Correo Directo"
        size="lg"
      >
        <form action={handleAction} className="flex flex-col gap-5 p-4 flex-1">
          
          <div className="flex gap-2 p-1 bg-zinc-900 border border-zinc-800 rounded">
            <button
              type="button"
              onClick={() => setRecipientType('lead')}
              className={`flex-1 py-1.5 text-[10px] font-mono uppercase tracking-wider flex items-center justify-center gap-1.5 ${recipientType === 'lead' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Contact size={12} /> Prospectos (Leads)
            </button>
            <button
              type="button"
              onClick={() => setRecipientType('client')}
              className={`flex-1 py-1.5 text-[10px] font-mono uppercase tracking-wider flex items-center justify-center gap-1.5 ${recipientType === 'client' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <Users size={12} /> Clientes Activos
            </button>
          </div>

          <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400">
            Destinatario ({recipientType === 'lead' ? 'Lead' : 'Cliente'})
            <select name="recipientId" required className="w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600">
              <option value="" disabled selected>Selecciona un destinatario...</option>
              {recipientType === 'lead' ? leads.map(l => (
                <option key={l.id} value={`lead_${l.id}`}>{l.fullName} ({l.email})</option>
              )) : clients.map(c => (
                <option key={c.id} value={`client_${c.id}`}>{c.name} ({c.email})</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400">
            Asunto
            <input name="subject" required className="w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600" />
          </label>

          <label className="flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400 flex-1">
            Mensaje (Markdown soportado)
            <textarea name="body" rows={8} required className="w-full h-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-600 resize-none font-sans" />
          </label>

          <div className="flex justify-end gap-2 pt-4 mt-auto border-t border-zinc-800">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 bg-zinc-900 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono hover:bg-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 bg-sky-500 text-white text-xs font-bold uppercase tracking-wider font-mono hover:bg-sky-400 disabled:opacity-50"
            >
              {isPending ? 'Enviando...' : 'Enviar Mensaje'}
            </button>
          </div>
        </form>
      </Drawer>
    </>
  )
}
