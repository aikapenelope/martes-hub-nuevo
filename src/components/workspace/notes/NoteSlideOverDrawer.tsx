'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar,
  CheckSquare,
  ExternalLink,
  Info,
  List,
  Pin,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react'
import { RichText, defaultJSXConverters } from '@payloadcms/richtext-lexical/react'

import type { Client, Lead, Note, User as UserType } from '@/payload-types'
import { NOTE_CATEGORIES, NOTE_CATEGORY_LABEL, type NoteCategory } from '@/collections/Notes'
import { Drawer } from '@/components/workspace/overlays'
import { StatusBadge } from '@/components/workspace/oled'
import { extractPlainTextFromLexical, hasComplexLexicalNodes } from '@/lib/notes-utils'
import {
  createNoteAction,
  deleteNoteAction,
  searchNoteRelatedAction,
  updateNoteAction,
} from '@/lib/notes-actions'

const dateFmt = new Intl.DateTimeFormat('es-VE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

interface NoteSlideOverDrawerProps {
  open: boolean
  onClose: () => void
  note?: Note | null
  defaultClientId?: number
  defaultLeadId?: number
  canEdit?: boolean
  isAdmin?: boolean
  onSaved?: () => void
}

export function NoteSlideOverDrawer({
  open,
  onClose,
  note,
  defaultClientId,
  defaultLeadId,
  canEdit = true,
  isAdmin = false,
  onSaved,
}: NoteSlideOverDrawerProps) {
  if (!open) return null

  // Usamos una key única para que React monte el formulario con su estado inicial
  // limpio sin necesidad de setState dentro de useEffect (regla oficial React 19).
  const formKey = note ? `view-${note.id}-${canEdit ? 'edit' : 'read'}` : `create-${defaultClientId ?? 0}-${defaultLeadId ?? 0}`

  return (
    <Drawer open={open} onClose={onClose} size="xl">
      <NoteDrawerContent
        key={formKey}
        note={note}
        onClose={onClose}
        defaultClientId={defaultClientId}
        defaultLeadId={defaultLeadId}
        canEdit={canEdit}
        isAdmin={isAdmin}
        onSaved={onSaved}
      />
    </Drawer>
  )
}

function NoteDrawerContent({
  note,
  onClose,
  defaultClientId,
  defaultLeadId,
  canEdit,
  isAdmin,
  onSaved,
}: {
  note?: Note | null
  onClose: () => void
  defaultClientId?: number
  defaultLeadId?: number
  canEdit: boolean
  isAdmin: boolean
  onSaved?: () => void
}) {
  const router = useRouter()
  const isEditing = Boolean(note)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Estado inicial calculado limpiamente sin efectos en cascada
  const [title, setTitle] = useState(() => note?.title ?? '')
  const [body, setBody] = useState(() => (note ? extractPlainTextFromLexical(note.body) : ''))
  const [category, setCategory] = useState<NoteCategory>(
    () => (note?.category as NoteCategory) ?? 'general',
  )
  const [pinned, setPinned] = useState(() => Boolean(note?.pinned))
  const [clientSel, setClientSel] = useState<{ id: number; label: string } | null>(() => {
    if (note?.client && typeof note.client === 'object') {
      const c = note.client as Client
      return { id: c.id, label: c.name }
    }
    if (typeof note?.client === 'number') {
      return { id: note.client, label: `Cliente #${note.client}` }
    }
    return defaultClientId ? { id: defaultClientId, label: 'Cliente seleccionado' } : null
  })
  const [leadSel, setLeadSel] = useState<{ id: number; label: string } | null>(() => {
    if (note?.lead && typeof note.lead === 'object') {
      const l = note.lead as Lead
      return { id: l.id, label: l.fullName }
    }
    if (typeof note?.lead === 'number') {
      return { id: note.lead, label: `Lead #${note.lead}` }
    }
    return defaultLeadId ? { id: defaultLeadId, label: 'Lead seleccionado' } : null
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, startDeleteTransition] = useTransition()

  const isComplex = Boolean(note && hasComplexLexicalNodes(note.body))

  // Helper para insertar texto rápido en la posición del cursor
  function insertSnippet(prefix: string, suffix: string = '') {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = body.substring(start, end)
    const replacement = `${prefix}${selected}${suffix}`

    const newBody = body.substring(0, start) + replacement + body.substring(end)
    setBody(newBody)

    setTimeout(() => {
      textarea.focus()
      const newCursor = start + replacement.length
      textarea.setSelectionRange(newCursor, newCursor)
    }, 10)
  }

  async function handleSave() {
    if (!canEdit) return

    const trimmedTitle = title.trim()
    const trimmedBody = body.trim()

    if (!trimmedTitle) {
      setError('Escribe un título para la nota')
      return
    }
    if (!trimmedBody) {
      setError('El contenido de la nota no puede estar vacío')
      return
    }

    setSaving(true)
    setError(null)

    if (isEditing && note) {
      const res = await updateNoteAction({
        noteId: note.id,
        title: trimmedTitle,
        bodyText: trimmedBody,
        category,
        pinned,
        clientId: clientSel?.id ?? null,
        leadId: leadSel?.id ?? null,
      })
      setSaving(false)
      if (!res.ok) {
        setError(res.error)
        return
      }
    } else {
      const res = await createNoteAction({
        title: trimmedTitle,
        bodyText: trimmedBody,
        category,
        pinned,
        clientId: clientSel?.id ?? null,
        leadId: leadSel?.id ?? null,
      })
      setSaving(false)
      if (!res.ok) {
        setError(res.error)
        return
      }
    }

    onClose()
    onSaved?.()
    router.refresh()
  }

  function handleDelete() {
    if (!note || !isAdmin) return
    if (!window.confirm('¿Eliminar esta nota permanentemente?')) return

    startDeleteTransition(async () => {
      const res = await deleteNoteAction({ noteId: note.id })
      if (!res.ok) {
        setError(res.error)
        return
      }
      onClose()
      onSaved?.()
      router.refresh()
    })
  }

  // Si el usuario es de solo lectura (Viewer)
  if (!canEdit && note) {
    const author =
      note.author && typeof note.author === 'object'
        ? (note.author as UserType).email
        : 'Equipo'

    return (
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center border border-zinc-700 bg-zinc-900 text-zinc-300">
              <StickyNote className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
                Detalle del Apunte
              </h2>
              <p className="text-[10px] font-mono text-zinc-500">Modo lectura (solo visualización)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="border border-zinc-800 p-1.5 text-zinc-400 hover:border-zinc-600 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
          <h1 className="text-xl font-bold text-white font-mono">{note.title}</h1>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="neutral">
              {NOTE_CATEGORY_LABEL[(note.category ?? 'general') as NoteCategory] ?? 'General'}
            </StatusBadge>
            {clientSel && (
              <span className="border border-sky-900/60 bg-sky-950/30 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">
                Cliente: {clientSel.label}
              </span>
            )}
            {leadSel && (
              <span className="border border-emerald-900/60 bg-emerald-950/30 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                Lead: {leadSel.label}
              </span>
            )}
            <span className="font-mono text-[10px] text-zinc-500 ml-auto">
              {dateFmt.format(new Date(note.createdAt))} · {author}
            </span>
          </div>

          <article className="border-t border-zinc-800/80 pt-4 text-sm leading-relaxed text-zinc-200">
            <RichText data={note.body} converters={defaultJSXConverters} />
          </article>
        </div>

        <div className="flex items-center justify-end border-t border-zinc-800 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="border border-zinc-800 px-4 py-1.5 text-xs font-mono uppercase text-zinc-300 hover:bg-zinc-900"
          >
            Cerrar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header personalizado del Drawer */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center border border-sky-500/30 bg-sky-950/40 text-sky-400">
            <StickyNote className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-white font-mono">
              {isEditing ? 'Editar Apunte' : 'Nuevo Apunte'}
            </h2>
            <p className="text-[10px] font-mono text-zinc-500">
              Espacio personal de notas y tareas rápidas
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPinned((prev) => !prev)}
            title={pinned ? 'Desfijar' : 'Fijar al tope'}
            className={`border p-1.5 text-xs transition ${
              pinned
                ? 'border-sky-500 bg-sky-950/40 text-sky-300'
                : 'border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {pinned ? <Pin className="h-3.5 w-3.5 fill-sky-400" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="border border-zinc-800 p-1.5 text-zinc-400 hover:border-zinc-600 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Alerta si la nota contiene formato enriquecido avanzado de Lexical */}
      {isComplex && (
        <div className="flex items-start gap-2 border border-amber-900/60 bg-amber-950/30 p-2.5 text-xs text-amber-200">
          <Info className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <div className="flex-1 text-[11px] font-mono leading-relaxed">
            Esta nota contiene formato enriquecido (encabezados, enlaces o bloques avanzados). Puedes actualizar el título/categoría sin perder el diseño, o editar con formato complejo en el CMS.
          </div>
          <a
            href={`/admin/collections/notes/${note?.id}`}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 border border-amber-800 bg-amber-900/40 px-2 py-1 text-[10px] font-mono uppercase text-amber-200 hover:bg-amber-900"
          >
            Abrir en CMS
          </a>
        </div>
      )}

      {/* Formulario Principal: Título & Contenido Amplio */}
      <div className="flex flex-1 flex-col gap-3">
        {/* Título tipo Notion / Scratchpad */}
        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título del apunte o idea…"
            maxLength={120}
            className="w-full border-b border-zinc-800 bg-transparent py-1.5 text-base font-bold text-white placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none"
          />
        </div>

        {/* Categorías como Pills Rápidas */}
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[10px] font-mono uppercase text-zinc-500">Categoría:</span>
          {NOTE_CATEGORIES.map((cat) => {
            const active = category === cat
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`border px-2 py-0.5 text-[10px] font-mono uppercase transition ${
                  active
                    ? 'border-sky-500 bg-sky-950/40 text-sky-300 font-bold'
                    : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {NOTE_CATEGORY_LABEL[cat]}
              </button>
            )
          })}
        </div>

        {/* Toolbar de Formato Rápido estilo To-Do */}
        <div className="flex flex-wrap items-center gap-1.5 border-y border-zinc-800/80 bg-zinc-950/80 py-1.5">
          <span className="text-[10px] font-mono text-zinc-500 mr-1">Insertar:</span>
          <button
            type="button"
            onClick={() => insertSnippet('\n- [ ] ')}
            className="flex items-center gap-1 border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[11px] font-mono text-zinc-300 hover:border-zinc-700 hover:text-white"
            title="Insertar casilla de to-do"
          >
            <CheckSquare className="h-3 w-3 text-sky-400" />
            <span>To-Do</span>
          </button>
          <button
            type="button"
            onClick={() => insertSnippet('\n- ')}
            className="flex items-center gap-1 border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[11px] font-mono text-zinc-300 hover:border-zinc-700 hover:text-white"
            title="Insertar viñeta"
          >
            <List className="h-3 w-3 text-zinc-400" />
            <span>Viñeta</span>
          </button>
          <button
            type="button"
            onClick={() =>
              insertSnippet(
                `[${new Intl.DateTimeFormat('es-VE', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(new Date())}] `,
              )
            }
            className="flex items-center gap-1 border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[11px] font-mono text-zinc-300 hover:border-zinc-700 hover:text-white"
            title="Insertar fecha y hora actual"
          >
            <Calendar className="h-3 w-3 text-zinc-400" />
            <span>Hoy</span>
          </button>
        </div>

        {/* Área de texto amplia para redactar cómodamente */}
        <div className="flex flex-1 flex-col">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribe tus notas aquí libremente...&#10;&#10;Usa '- [ ] tarea' para listas pendientes, o párrafos sueltos para ideas."
            className="min-h-[320px] w-full flex-1 resize-y border border-zinc-900 bg-black/60 p-3 font-sans text-sm leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-700 focus:outline-none"
          />
        </div>

        {/* Sección CRM Secundaria y Opcional (Colapsada por defecto) */}
        <details className="group border border-zinc-900 bg-zinc-950/60 transition">
          <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-zinc-400 group-open:border-b group-open:border-zinc-900 hover:text-white flex items-center justify-between">
            <span>Vincular a CRM (Opcional)</span>
            <span className="text-zinc-600 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="flex flex-col gap-3 p-3">
            <p className="text-[10px] font-mono text-zinc-500">
              Las notas son personales por defecto. Si deseas asociar este apunte a un cliente o lead del CRM, selecciónalo abajo:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase text-zinc-400">Cliente</span>
                <RelatedPicker
                  type="client"
                  placeholder="Buscar cliente..."
                  selected={clientSel}
                  onSelect={setClientSel}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-mono uppercase text-zinc-400">Lead</span>
                <RelatedPicker
                  type="lead"
                  placeholder="Buscar lead..."
                  selected={leadSel}
                  onSelect={setLeadSel}
                />
              </div>
            </div>
          </div>
        </details>

        {error && (
          <p className="border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-xs font-mono text-rose-300">
            {error}
          </p>
        )}
      </div>

      {/* Footer de Acciones */}
      <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
        <div className="flex items-center gap-2">
          {/* El botón de eliminar SOLO se renderiza para administradores */}
          {isEditing && note && isAdmin && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={pendingDelete}
              title="Eliminar apunte (solo administradores)"
              className="border border-zinc-900 p-2 text-zinc-500 transition hover:border-rose-900/60 hover:bg-rose-950/20 hover:text-rose-400 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          {isEditing && note && (
            <a
              href={`/admin/collections/notes/${note.id}`}
              target="_blank"
              rel="noreferrer"
              title="Abrir en editor avanzado de Payload CMS"
              className="flex items-center gap-1 border border-zinc-900 px-2 py-1.5 text-[10px] font-mono uppercase text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            >
              <span>CMS</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="border border-zinc-800 px-3 py-1.5 text-xs font-mono uppercase text-zinc-400 hover:border-zinc-700 hover:text-white"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="bg-sky-400 px-4 py-1.5 text-xs font-mono font-bold uppercase text-black transition hover:bg-sky-300 disabled:opacity-50 shadow-[0_0_12px_rgba(56,189,248,0.25)]"
          >
            {saving ? 'Guardando…' : isEditing ? 'Actualizar apunte' : 'Guardar apunte'}
          </button>
        </div>
      </div>
    </div>
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
      if (res.ok && latestQueryRef.current === currentQuery) {
        setResults(res.results)
        setOpen(true)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, type])

  if (selected) {
    return (
      <div className="flex items-center justify-between border border-sky-800/80 bg-sky-950/30 px-2 py-1.5">
        <span className="truncate text-xs font-mono text-sky-200">{selected.label}</span>
        <button type="button" className="text-sky-400 hover:text-white ml-1" onClick={() => onSelect(null)}>
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
        className="w-full border border-zinc-800 bg-black px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto border border-zinc-700 bg-zinc-950 shadow-xl">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800 font-mono"
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
