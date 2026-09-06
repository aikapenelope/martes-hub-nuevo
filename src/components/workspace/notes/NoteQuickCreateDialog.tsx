'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, StickyNote, X } from 'lucide-react'

import { createNoteAction, searchNoteRelatedAction } from '@/lib/notes-actions'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

interface NoteQuickCreateDialogProps {
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
  defaultClientId,
  defaultLeadId,
  variant = 'primary',
  label = 'Nueva nota',
}: NoteQuickCreateDialogProps) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [formResetKey, setFormResetKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clientSel, setClientSel] = useState<{ id: number; label: string } | null>(
    defaultClientId ? { id: defaultClientId, label: 'Cliente seleccionado' } : null,
  )
  const [leadSel, setLeadSel] = useState<{ id: number; label: string } | null>(
    defaultLeadId ? { id: defaultLeadId, label: 'Lead seleccionado' } : null,
  )

  const btnCls =
    variant === 'primary'
      ? 'px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-black flex items-center gap-2 uppercase transition shadow-[0_0_16px_rgba(56,189,248,0.35)]'
      : 'px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold flex items-center gap-2 uppercase transition'

  async function handleSubmit(formData: FormData) {
    setSaving(true)
    setError(null)
    const res = await createNoteAction({
      title: String(formData.get('title') ?? ''),
      bodyText: String(formData.get('body') ?? ''),
      category: String(formData.get('category') ?? 'general'),
      pinned: formData.get('pinned') === 'on',
      clientId: clientSel?.id ?? null,
      leadId: leadSel?.id ?? null,
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    // Reset completo del formulario y pickers para no dejar borradores viejos
    formRef.current?.reset()
    setClientSel(defaultClientId ? { id: defaultClientId, label: 'Cliente seleccionado' } : null)
    setLeadSel(defaultLeadId ? { id: defaultLeadId, label: 'Lead seleccionado' } : null)
    setFormResetKey((k) => k + 1)
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

        <form key={formResetKey} ref={formRef} action={handleSubmit} className="flex flex-col gap-3 p-4">
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
              <RelatedPicker
                type="client"
                placeholder="Buscar cliente por nombre..."
                selected={clientSel}
                onSelect={setClientSel}
              />
              <RelatedPicker
                type="lead"
                placeholder="Buscar lead por nombre..."
                selected={leadSel}
                onSelect={setLeadSel}
              />
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

function RelatedPicker({
  type,
  placeholder,
  selected,
  onSelect,
}: {
  type: 'client' | 'lead'
  placeholder: string
  selected: { id: number; label: string } | null
  onSelect: (value: { id: number; label: string } | null) => void
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Array<{ id: number; label: string }>>([])
  const [open, setOpen] = useState(false)
  const latestQueryRef = useRef('')

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) {
        setResults([])
        setOpen(false)
        return
      }
      const currentQuery = q.trim()
      const res = await searchNoteRelatedAction({ q: currentQuery, type })
      // Guard de carrera: una respuesta tardía de una búsqueda vieja nunca
      // reemplaza los resultados de la consulta actual (revisión Devin PR #75).
      if (res.ok && latestQueryRef.current === currentQuery) {
        setResults(res.results)
        setOpen(true)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, type])

  if (selected) {
    return (
      <div className="flex items-center justify-between border border-sky-800 bg-sky-950/30 px-2 py-1.5">
        <span className="truncate text-xs text-sky-200">{selected.label}</span>
        <button type="button" className="text-sky-400 hover:text-white" onClick={() => onSelect(null)}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          latestQueryRef.current = e.target.value.trim()
          setQ(e.target.value)
        }}
        placeholder={placeholder}
        className={inputCls}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto border border-zinc-700 bg-zinc-950 shadow-lg">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
                onMouseDown={() => {
                  onSelect(r)
                  setQ('')
                  setOpen(false)
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
