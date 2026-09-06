'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Edit3,
  Pin,
  PinOff,
  Plus,
  Search,
  StickyNote,
  Trash2,
} from 'lucide-react'
import { RichText, defaultJSXConverters } from '@payloadcms/richtext-lexical/react'

import type { Client, Lead, Note, User as UserType } from '@/payload-types'
import { NOTE_CATEGORIES, NOTE_CATEGORY_LABEL, type NoteCategory } from '@/collections/Notes'
import { EmptyState, OledCard, PageHero, StatusBadge } from '@/components/workspace/oled'
import { NoteSlideOverDrawer } from '@/components/workspace/notes/NoteSlideOverDrawer'
import { deleteNoteAction, toggleNotePinAction } from '@/lib/notes-actions'

const dateFmt = new Intl.DateTimeFormat('es-VE', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

interface NotesWorkspaceProps {
  notes: Note[]
  total: number
  totalPages: number
  currentPage: number
  activeQuery: string
  activeCategory: string
  pinnedOnly: boolean
  canEdit: boolean
  isAdmin: boolean
}

export function NotesWorkspace({
  notes,
  total,
  totalPages,
  currentPage,
  activeQuery,
  activeCategory,
  pinnedOnly,
  canEdit,
  isAdmin,
}: NotesWorkspaceProps) {
  const router = useRouter()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)

  const pinnedNotes = notes.filter((n) => n.pinned)
  const otherNotes = notes.filter((n) => !n.pinned)

  function openCreateDrawer() {
    setSelectedNote(null)
    setDrawerOpen(true)
  }

  function openEditDrawer(note: Note) {
    setSelectedNote(note)
    setDrawerOpen(true)
  }

  function buildFilterUrl(params: { q?: string; cat?: string; pin?: string; page?: string }) {
    const sp = new URLSearchParams()
    if (params.q) sp.set('q', params.q)
    if (params.cat) sp.set('cat', params.cat)
    if (params.pin) sp.set('pin', params.pin)
    if (params.page && params.page !== '1') sp.set('page', params.page)
    const qs = sp.toString()
    return `/workspace/notes${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHero
        eyebrow="CUADERNO DE APUNTES"
        title="Notas & To-Dos"
        description="Espacio cómodo para escribir apuntes personales, tareas rápidas e ideas. Edita al instante en el panel lateral deslizable y vincula opcionalmente al CRM solo cuando lo necesites."
        actions={
          canEdit ? (
            <button
              type="button"
              onClick={openCreateDrawer}
              className="flex items-center gap-2 bg-sky-400 px-4 py-2 font-mono text-xs font-black uppercase text-black transition hover:bg-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.35)]"
            >
              <Plus className="h-4 w-4" />
              <span>Nuevo apunte</span>
            </button>
          ) : undefined
        }
      />

      {/* Barra de Filtros y Búsqueda */}
      <OledCard className="flex flex-col gap-3">
        <form action="/workspace/notes" method="get" className="flex items-center gap-2">
          {activeCategory && <input type="hidden" name="cat" value={activeCategory} />}
          {pinnedOnly && <input type="hidden" name="pin" value="1" />}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              name="q"
              defaultValue={activeQuery}
              placeholder="Buscar en tus notas..."
              className="w-full border border-zinc-800 bg-black py-2 pl-9 pr-3 text-sm text-white placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs uppercase text-zinc-200 hover:bg-zinc-800"
          >
            Buscar
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={buildFilterUrl({ q: activeQuery, pin: pinnedOnly ? '1' : undefined })}
            className={`border px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider transition ${
              !activeCategory
                ? 'border-sky-500 bg-sky-950/40 text-sky-300'
                : 'border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            Todas
          </Link>
          {NOTE_CATEGORIES.map((c) => (
            <Link
              key={c}
              href={buildFilterUrl({ q: activeQuery, cat: c, pin: pinnedOnly ? '1' : undefined })}
              className={`border px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider transition ${
                activeCategory === c
                  ? 'border-sky-500 bg-sky-950/40 text-sky-300'
                  : 'border-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {NOTE_CATEGORY_LABEL[c]}
            </Link>
          ))}
          <Link
            href={buildFilterUrl({
              q: activeQuery,
              cat: activeCategory,
              pin: pinnedOnly ? undefined : '1',
            })}
            className={`border px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider transition ${
              pinnedOnly
                ? 'border-sky-500 bg-sky-950/40 text-sky-300'
                : 'border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            <Pin className="mr-1 inline h-3 w-3" /> Solo fijadas
          </Link>
          <span className="ml-auto font-mono text-[11px] text-zinc-500">{total} apunte(s)</span>
        </div>
      </OledCard>

      {/* Estado Vacío */}
      {total === 0 && (
        <EmptyState>
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <StickyNote className="h-10 w-10 text-zinc-600" />
            <p className="text-sm font-bold uppercase tracking-wider text-zinc-300">
              No hay notas todavía
            </p>
            <p className="max-w-md text-xs text-zinc-500">
              {activeQuery || activeCategory || pinnedOnly
                ? 'Ningún apunte coincide con los filtros de búsqueda.'
                : 'Empieza escribiendo un apunte rápido para vaciar tus ideas, lista de pendientes o acuerdos.'}
            </p>
            {canEdit && !activeQuery && !activeCategory && !pinnedOnly && (
              <button
                type="button"
                onClick={openCreateDrawer}
                className="mt-3 flex items-center gap-1.5 border border-sky-500/40 bg-sky-950/20 px-3 py-1.5 font-mono text-xs text-sky-300 transition hover:bg-sky-950/50"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Escribir primer apunte</span>
              </button>
            )}
          </div>
        </EmptyState>
      )}

      {/* Sección Fijadas */}
      {pinnedNotes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-zinc-400">
            <Pin className="h-3.5 w-3.5 text-sky-400" /> Fijadas al inicio
          </h2>
          <div className="grid gap-3 xl:grid-cols-2">
            {pinnedNotes.map((note) => (
              <NoteWorkspaceCard
                key={note.id}
                note={note}
                canEdit={canEdit}
                isAdmin={isAdmin}
                onClick={() => openEditDrawer(note)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Sección Todas */}
      {otherNotes.length > 0 && (
        <section className="flex flex-col gap-3">
          {pinnedNotes.length > 0 && (
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-zinc-400">
              Otros apuntes
            </h2>
          )}
          <div className="grid gap-3 xl:grid-cols-2">
            {otherNotes.map((note) => (
              <NoteWorkspaceCard
                key={note.id}
                note={note}
                canEdit={canEdit}
                isAdmin={isAdmin}
                onClick={() => openEditDrawer(note)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3 py-2 font-mono text-xs uppercase tracking-wider">
          {currentPage > 1 ? (
            <Link
              href={buildFilterUrl({
                q: activeQuery,
                cat: activeCategory,
                pin: pinnedOnly ? '1' : undefined,
                page: String(currentPage - 1),
              })}
              className="border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200 hover:bg-zinc-800"
            >
              ← Anterior
            </Link>
          ) : (
            <span className="border border-zinc-900 px-3 py-2 text-zinc-600">← Anterior</span>
          )}
          <span className="text-zinc-400">
            Página {currentPage} de {totalPages}
          </span>
          {currentPage < totalPages ? (
            <Link
              href={buildFilterUrl({
                q: activeQuery,
                cat: activeCategory,
                pin: pinnedOnly ? '1' : undefined,
                page: String(currentPage + 1),
              })}
              className="border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200 hover:bg-zinc-800"
            >
              Siguiente →
            </Link>
          ) : (
            <span className="border border-zinc-900 px-3 py-2 text-zinc-600">Siguiente →</span>
          )}
        </nav>
      )}

      {/* Slide-Over Drawer Deslizable */}
      <NoteSlideOverDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        note={selectedNote}
        onSaved={() => router.refresh()}
      />
    </div>
  )
}

function NoteWorkspaceCard({
  note,
  canEdit,
  isAdmin,
  onClick,
}: {
  note: Note
  canEdit: boolean
  isAdmin: boolean
  onClick: () => void
}) {
  const router = useRouter()
  function nameOf(rel: unknown): string {
    if (rel == null || typeof rel === 'number') return ''
    const r = rel as Client | Lead | UserType
    return (r as Client).name ?? (r as Lead).fullName ?? (r as UserType).email ?? ''
  }

  const clientName = nameOf(note.client)
  const leadName = nameOf(note.lead)
  const authorName = nameOf(note.author) || 'Yo'
  const isPersonal = !clientName && !leadName

  async function handleTogglePin(e: React.MouseEvent) {
    e.stopPropagation()
    await toggleNotePinAction({ noteId: note.id })
    router.refresh()
  }

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm('¿Eliminar esta nota permanentemente?')) return
    await deleteNoteAction({ noteId: note.id })
    router.refresh()
  }

  return (
    <OledCard
      className="group cursor-pointer flex flex-col gap-3 transition-colors hover:border-zinc-600"
      bracketAccent={Boolean(note.pinned)}
      onClick={onClick}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white group-hover:text-sky-300 transition-colors">
            {note.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-sky-400 fill-sky-400" />}
            <span className="truncate">{note.title}</span>
          </h3>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            {dateFmt.format(new Date(note.createdAt))} · {authorName}
          </p>
        </div>

        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
          {canEdit && (
            <button
              type="button"
              onClick={handleTogglePin}
              title={note.pinned ? 'Desfijar' : 'Fijar al tope'}
              className="border border-zinc-800 bg-black p-1.5 text-zinc-400 hover:border-zinc-600 hover:text-white"
            >
              {note.pinned ? <PinOff className="h-3 w-3 text-sky-400" /> : <Pin className="h-3 w-3" />}
            </button>
          )}
          {isAdmin && (
            <button
              type="button"
              onClick={handleDelete}
              title="Eliminar"
              className="border border-zinc-800 bg-black p-1.5 text-zinc-400 hover:border-rose-800 hover:text-rose-400"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
          <span className="border border-zinc-800 bg-zinc-900/80 px-2 py-1 font-mono text-[10px] uppercase text-zinc-400 group-hover:border-zinc-600 group-hover:text-white flex items-center gap-1">
            <Edit3 className="h-3 w-3" />
            <span>Editar</span>
          </span>
        </div>
      </header>

      {/* Badges de Categoría y Relación */}
      <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <StatusBadge tone="neutral">
          {NOTE_CATEGORY_LABEL[(note.category ?? 'general') as NoteCategory] ?? 'General'}
        </StatusBadge>

        {isPersonal ? (
          <span className="border border-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
            Personal
          </span>
        ) : (
          <>
            {clientName && (
              <span className="border border-sky-900/60 bg-sky-950/30 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">
                Cliente: {clientName}
              </span>
            )}
            {leadName && (
              <span className="border border-emerald-900/60 bg-emerald-950/30 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                Lead: {leadName}
              </span>
            )}
          </>
        )}
      </div>

      {/* Vista previa del contenido */}
      <article className="border-t border-zinc-800/60 pt-3 text-xs leading-relaxed text-zinc-300 line-clamp-4">
        <RichText data={note.body} converters={defaultJSXConverters} />
      </article>
    </OledCard>
  )
}
