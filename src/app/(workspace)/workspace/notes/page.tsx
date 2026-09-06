/**
 * NotesPage — `/workspace/notes`. Notas enriquecidas del equipo: renderizado
 * Lexical (`RichText` de richtext-lexical), fijadas al tope, filtros por
 * categoría/cliente/búsqueda. La edición completa (toolbar rica) vive en
 * /admin — desde aquí se crea rápido y se enriquece con un clic.
 */

import Link from 'next/link'
import type { Where } from 'payload'
import { Pin, Search, StickyNote } from 'lucide-react'
import type { Client, Lead, Note, User } from '@/payload-types'
import { RichText, defaultJSXConverters } from '@payloadcms/richtext-lexical/react'

import { NOTE_CATEGORY_LABEL } from '@/collections/Notes'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { NoteCardActions } from '@/components/workspace/notes/NoteCardActions'
import { NoteQuickCreateDialog } from '@/components/workspace/notes/NoteQuickCreateDialog'
import { EmptyState, OledCard, PageHero, StatusBadge } from '@/components/workspace/oled'

const dateFmt = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })

const CATEGORIES = ['general', 'cliente', 'reunion', 'seguimiento', 'idea', 'recordatorio'] as const
const PAGE_SIZE = 24

function buildUrl(params: { q?: string; cat?: string; pin?: string; page?: string }): string {
  const sp = new URLSearchParams()
  if (params.q) sp.set('q', params.q)
  if (params.cat) sp.set('cat', params.cat)
  if (params.pin) sp.set('pin', params.pin)
  if (params.page && params.page !== '1') sp.set('page', params.page)
  const qs = sp.toString()
  return `/workspace/notes${qs ? `?${qs}` : ''}`
}


export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cat?: string; pin?: string; page?: string }>
}) {
  const params = await searchParams
  const context = await getWorkspaceContext()
  const { payload, user, tenantId, canEdit, isAdmin } = context

  const q = params.q?.trim() ?? ''
  const cat = params.cat && (CATEGORIES as readonly string[]).includes(params.cat) ? params.cat : ''
  const pinOnly = params.pin === '1'
  const pageNum = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

  const conditions: Where[] = [{ tenant: { equals: tenantId } }]
  if (q) conditions.push({ title: { like: q } })
  if (cat) conditions.push({ category: { equals: cat } })
  if (pinOnly) conditions.push({ pinned: { equals: true } })
  const where: Where = { and: conditions }

  const [notesRes] = await Promise.all([
    payload.find({
      collection: 'notes',
      where,
      depth: 1,
      limit: PAGE_SIZE,
      page: pageNum,
      sort: '-pinned,-createdAt',
      overrideAccess: false,
      user,
    }),
  ])

  const notes = notesRes.docs as Note[]
  const pinnedNotes = notes.filter((n) => n.pinned)
  const otherNotes = notes.filter((n) => !n.pinned)
  const total = notesRes.totalDocs
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="flex flex-col gap-4">
      <PageHero
        eyebrow="MEMORIA DEL EQUIPO"
        title="Notas"
        description="Notas enriquecidas del equipo — independientes o vinculadas a clientes y leads. El editor completo (títulos, listas, checklist, citas, links) vive en /admin; crea rápido desde aquí."
        actions={
          canEdit ? (
            <NoteQuickCreateDialog />
          ) : undefined
        }
      />

      {/* Filtros: búsqueda + categorías + fijadas */}
      <OledCard className="flex flex-col gap-3">
        <form action="/workspace/notes" method="get" className="flex items-center gap-2">
          {cat && <input type="hidden" name="cat" value={cat} />}
          {pinOnly && <input type="hidden" name="pin" value="1" />}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar notas por título…"
              className="w-full border border-zinc-800 bg-black py-2 pl-9 pr-3 text-sm text-white placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
            />
          </div>
          <button type="submit" className="border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-mono uppercase text-zinc-200 hover:bg-zinc-800">
            Buscar
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={buildUrl({ q, pin: pinOnly ? '1' : undefined })} className={`border px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider transition ${!cat ? 'border-sky-500 bg-sky-950/40 text-sky-300' : 'border-zinc-800 text-zinc-400 hover:text-white'}`}>
            Todas
          </Link>
          {CATEGORIES.map((c) => (
            <Link key={c} href={buildUrl({ q, cat: c, pin: pinOnly ? '1' : undefined })} className={`border px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider transition ${cat === c ? 'border-sky-500 bg-sky-950/40 text-sky-300' : 'border-zinc-800 text-zinc-400 hover:text-white'}`}>
              {NOTE_CATEGORY_LABEL[c]}
            </Link>
          ))}
          <Link href={buildUrl({ q, cat, pin: pinOnly ? undefined : '1' })} className={`border px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider transition ${pinOnly ? 'border-sky-500 bg-sky-950/40 text-sky-300' : 'border-zinc-800 text-zinc-400 hover:text-white'}`}>
            <Pin className="mr-1 inline w-3 h-3" /> Solo fijadas
          </Link>
          <span className="ml-auto text-[11px] font-mono text-zinc-500">{total} nota(s)</span>
        </div>
      </OledCard>

      {total === 0 && (
        <EmptyState>
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <StickyNote className="w-8 h-8 text-zinc-600" />
            <p className="text-sm font-bold uppercase tracking-wider text-zinc-300">Sin notas todavía</p>
            <p className="max-w-md text-xs text-zinc-500">
              {q || cat || pinOnly
                ? 'Ningún resultado con estos filtros — prueba limpiando la búsqueda.'
                : 'Crea la primera nota del equipo: acuerdos, ideas, seguimientos. Se pueden vincular a clientes y leads.'}
            </p>
          </div>
        </EmptyState>
      )}

      {pinnedNotes.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-zinc-400">
            <Pin className="w-3.5 h-3.5 text-sky-400" /> Fijadas
          </h2>
          <div className="grid gap-3 xl:grid-cols-2">
            {pinnedNotes.map((note) => (
              <NoteCard key={note.id} note={note} canEdit={canEdit} isAdmin={isAdmin} />
            ))}
          </div>
        </section>
      )}

      {otherNotes.length > 0 && (
        <section className="flex flex-col gap-3">
          {pinnedNotes.length > 0 && <h2 className="text-[11px] font-mono uppercase tracking-widest text-zinc-400">Todas</h2>}
          <div className="grid gap-3 xl:grid-cols-2">
            {otherNotes.map((note) => (
              <NoteCard key={note.id} note={note} canEdit={canEdit} isAdmin={isAdmin} />
            ))}
          </div>
        </section>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-3 py-2 text-xs font-mono uppercase tracking-wider">
          {pageNum > 1 ? (
            <Link href={buildUrl({ q, cat, pin: pinOnly ? '1' : undefined, page: String(pageNum - 1) })} className="border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200 hover:bg-zinc-800">
              ← Anterior
            </Link>
          ) : (
            <span className="border border-zinc-900 px-3 py-2 text-zinc-600">← Anterior</span>
          )}
          <span className="text-zinc-400">
            Página {pageNum} de {totalPages}
          </span>
          {pageNum < totalPages ? (
            <Link href={buildUrl({ q, cat, pin: pinOnly ? '1' : undefined, page: String(pageNum + 1) })} className="border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-200 hover:bg-zinc-800">
              Siguiente →
            </Link>
          ) : (
            <span className="border border-zinc-900 px-3 py-2 text-zinc-600">Siguiente →</span>
          )}
        </nav>
      )}
    </div>
  )
}

function NoteCard({ note, canEdit, isAdmin }: { note: Note; canEdit: boolean; isAdmin: boolean }) {
  function nameOf(rel: unknown): string {
    if (rel == null || typeof rel === 'number') return ''
    const r = rel as Client | Lead | User
    return (r as Client).name ?? (r as Lead).fullName ?? (r as User).email ?? ''
  }

  const clientName = nameOf(note.client)
  const leadName = nameOf(note.lead)
  const authorName = nameOf(note.author) || 'Equipo'
  const clientId = typeof note.client === 'object' && note.client ? note.client.id : null
  const leadId = typeof note.lead === 'object' && note.lead ? note.lead.id : null

  return (
    <OledCard className="flex flex-col gap-3" bracketAccent={Boolean(note.pinned)}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white">
            {note.pinned && <Pin className="w-3.5 h-3.5 shrink-0 text-sky-400" />}
            <span className="truncate">{note.title}</span>
          </h3>
          <p className="mt-0.5 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
            {dateFmt.format(new Date(note.createdAt))} · {authorName}
          </p>
        </div>
        <NoteCardActions
          noteId={note.id}
          pinned={Boolean(note.pinned)}
          canEdit={canEdit}
          isAdmin={isAdmin}
          adminHref={`/admin/collections/notes/${note.id}`}
        />
      </header>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge tone="neutral">{NOTE_CATEGORY_LABEL[(note.category ?? 'general') as keyof typeof NOTE_CATEGORY_LABEL] ?? 'General'}</StatusBadge>
        {clientName && clientId && (
          <Link
            href={`/workspace/crm/clients/${clientId}`}
            className="border border-zinc-800 px-2 py-0.5 text-[10px] font-mono uppercase text-zinc-300 hover:border-zinc-600 hover:text-white"
          >
            {clientName}
          </Link>
        )}
        {leadName && leadId && (
          <Link
            href={`/workspace/crm/leads/${leadId}`}
            className="border border-zinc-800 px-2 py-0.5 text-[10px] font-mono uppercase text-zinc-300 hover:border-zinc-600 hover:text-white"
          >
            Lead: {leadName}
          </Link>
        )}
      </div>

      {/* Contenido Lexical renderizado (títulos, listas, checklist, citas, links) */}
      <article className="border-t border-zinc-800/60 pt-3 text-sm text-zinc-300">
        <RichText data={note.body} converters={defaultJSXConverters} />
      </article>
    </OledCard>
  )
}


