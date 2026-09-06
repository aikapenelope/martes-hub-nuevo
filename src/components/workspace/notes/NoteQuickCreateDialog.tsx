'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, StickyNote, X } from 'lucide-react'

import { createNoteAction } from '@/lib/notes-actions'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

interface NoteQuickCreateDialogProps {
  clients: Array<{ id: number; name: string }>
  leads: Array<{ id: number; fullName: string }>
  defaultClientId?: number
  defaultLeadId?: number
  variant?: 'primary' | 'secondary'
  label?: string
}

/**
 * Creación rápida de notas desde el workspace. El cuerpo se guarda como
 * Lexical (párrafos simples) y se enriquece después con el editor completo
 * en /admin (botón "Editar" de cada tarjeta).
 */
export function NoteQuickCreateDialog({
  clients,
  leads,
  defaultClientId,
  defaultLeadId,
  variant = 'primary',
  label = 'Nueva nota',
}: NoteQuickCreateDialogProps) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const btnCls =
    variant === 'primary'
      ? 'px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-black flex items-center gap-2 uppercase transition shadow-[0_0_16px_rgba(56,189,248,0.35)]'
      : 'px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold flex items-center gap-2 uppercase transition'

  async function handleSubmit(formData: FormData) {
    setSaving(true)
    setError(null)
    const clientRaw = String(formData.get('client') ?? '')
    const leadRaw = String(formData.get('lead') ?? '')
    const res = await createNoteAction({
      title: String(formData.get('title') ?? ''),
      bodyText: String(formData.get('body') ?? ''),
      category: String(formData.get('category') ?? 'general'),
      pinned: formData.get('pinned') === 'on',
      clientId: clientRaw ? Number(clientRaw) : null,
      leadId: leadRaw ? Number(leadRaw) : null,
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    dialogRef.current?.close()
    router.refresh()
  }

  return (
    <>
      <button type="button" className={`${btnCls} text-xs font-mono`} onClick={() => dialogRef.current?.showModal()}>
        <Plus className="w-4 h-4" /> {label}
      </button>

      <dialog
        ref={dialogRef}
        className="workspace-dialog m-auto w-[min(32rem,calc(100vw-2rem))] border border-zinc-800 bg-zinc-950 p-0 text-white"
        onCancel={() => dialogRef.current?.close()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-white">
              <StickyNote className="w-4 h-4 text-sky-400" /> Nueva nota
            </h2>
            <p className="text-[10px] font-mono text-zinc-500">Texto simple ahora; enriquece después con el editor completo</p>
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} className="text-zinc-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </header>

        <form action={handleSubmit} className="flex flex-col gap-3 p-4">
          <label className={labelCls}>
            Título *
            <input name="title" required maxLength={120} className={inputCls} placeholder="Ej: Acuerdos de la reunión" />
          </label>

          <label className={labelCls}>
            Contenido *
            <textarea
              name="body"
              required
              rows={6}
              className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
              placeholder={'Escribe la nota...\n\nLínea en blanco = párrafo nuevo'}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              Categoría
              <select name="category" defaultValue="general" className={inputCls}>
                <option value="general">General</option>
                <option value="cliente">Cliente</option>
                <option value="reunion">Reunión</option>
                <option value="seguimiento">Seguimiento</option>
                <option value="idea">Idea</option>
                <option value="recordatorio">Recordatorio</option>
              </select>
            </label>
            <label className={labelCls}>
              Asociar a
              <div className="flex flex-col gap-1">
                <select name="client" defaultValue={defaultClientId ? String(defaultClientId) : ''} className={inputCls}>
                  <option value="">— Sin cliente —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select name="lead" defaultValue={defaultLeadId ? String(defaultLeadId) : ''} className={inputCls}>
                  <option value="">— Sin lead —</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-zinc-400">
            <input type="checkbox" name="pinned" className="h-4 w-4 accent-sky-400" />
            Fijar al tope
          </label>

          {error && <p className="border border-rose-900 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">{error}</p>}

          <footer className="flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
            <button type="button" onClick={() => dialogRef.current?.close()} className="px-3 py-2 text-xs font-mono uppercase text-zinc-400 hover:text-white">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-sky-400 hover:bg-sky-300 disabled:opacity-50 text-black font-black uppercase text-xs transition"
            >
              {saving ? 'Guardando…' : 'Crear nota'}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  )
}

