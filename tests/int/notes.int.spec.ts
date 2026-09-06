import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'
import {
  buildLexicalFromPlainText,
  createNoteAction,
  deleteNoteAction,
  searchNoteRelatedAction,
  toggleNotePinAction,
  updateNoteAction,
} from '@/lib/notes-actions'
import { extractPlainTextFromLexical, hasComplexLexicalNodes } from '@/lib/notes-utils'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function mockPayloadFactory({
  notes = [],
  users = [],
  related = { clients: { 5: { id: 5, tenant: 1 } }, leads: { 6: { id: 6, tenant: 1 } } } as Record<string, Record<number, unknown>>,
}: {
  notes?: Array<Record<string, unknown>>
  users?: Array<Record<string, unknown>>
  related?: Record<string, Record<number, unknown>>
} = {}) {
  const created: Array<Record<string, unknown>> = []
  const updated: Array<{ id: number; data: Record<string, unknown> }> = []
  const deleted: number[] = []
  let nextId = notes.length + 1

  const payload = {
    create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
      const doc = { id: nextId++, pinned: false, ...data }
      created.push(doc)
      return Promise.resolve(doc)
    }),
    findByID: vi.fn(({ collection, id }: { collection: string; id: number }) => {
      if (collection === 'clients' || collection === 'leads') {
        return Promise.resolve(related[collection]?.[id] ?? null)
      }
      const doc = [...notes, ...created].find((n) => n.id === id)
      return Promise.resolve(doc ?? null)
    }),
    update: vi.fn(({ id, data }: { id: number; data: Record<string, unknown> }) => {
      updated.push({ id, data })
      const doc = [...notes, ...created].find((n) => n.id === id) ?? {}
      return Promise.resolve({ ...doc, ...data })
    }),
    delete: vi.fn(({ id }: { id: number }) => {
      deleted.push(id)
      return Promise.resolve({ id })
    }),
    find: vi.fn(() => Promise.resolve({ docs: users, totalDocs: users.length })),
  } as unknown as Payload

  return { payload, created, updated, deleted }
}

function makeContext({
  payload,
  canEdit = true,
  isAdmin = false,
  tenantId = 1,
}: {
  payload: Payload
  canEdit?: boolean
  isAdmin?: boolean
  tenantId?: number
}) {
  const user = { id: 7, email: 'test@martes.local', roles: [isAdmin ? 'admin' : 'agente'] } as unknown as User
  return { payload, user, tenantId, tenant: { id: tenantId }, canEdit, isAdmin, roles: isAdmin ? ['admin'] : ['agente'] }
}

vi.mock('@/lib/workspace-context', () => ({ getWorkspaceContext: vi.fn() }))

import { getWorkspaceContext } from '@/lib/workspace-context'
const mockedContext = vi.mocked(getWorkspaceContext)

describe('Notes — acciones del workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildLexicalFromPlainText', () => {
    it('convierte párrafos separados por línea en blanco en nodos Lexical', async () => {
      const lexical = (await buildLexicalFromPlainText('Primera línea\nsegunda.\n\nSegundo párrafo')) as {
        root: { type: string; children: Array<{ type: string; children: Array<{ text: string }> }> }
      }
      expect(lexical.root.type).toBe('root')
      expect(lexical.root.children).toHaveLength(2)
      expect(lexical.root.children[0].type).toBe('paragraph')
      expect(lexical.root.children[0].children[0].text).toContain('Primera línea')
    })

    it('produce un párrafo vacío válido para texto vacío', async () => {
      const lexical = (await buildLexicalFromPlainText('')) as { root: { children: unknown[] } }
      expect(lexical.root.children).toHaveLength(1)
    })
  })

  describe('createNoteAction', () => {
    it('crea la nota con tenant, autor implícito en /admin y cuerpo Lexical', async () => {
      const { payload, created } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await createNoteAction({ title: 'Acuerdos', bodyText: 'Punto 1\n\nPunto 2', clientId: 5 })

      expect(res.ok).toBe(true)
      expect(created).toHaveLength(1)
      expect(created[0].tenant).toBe(1)
      expect(created[0].client).toBe(5)
      expect(created[0].title).toBe('Acuerdos')
      const body = created[0].body as { root: { children: unknown[] } }
      expect(body.root.children).toHaveLength(2)
    })

    it('rechaza título o contenido vacío', async () => {
      const { payload } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await createNoteAction({ title: '  ', bodyText: 'x' })
      expect(res.ok).toBe(false)
      expect((res as { error?: string }).error).toContain('obligatorios')
    })

    it('rechaza vincular un cliente de otro tenant (cross-tenant)', async () => {
      const { payload, created } = mockPayloadFactory({ related: { clients: {}, leads: {} } })
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await createNoteAction({ title: 'x', bodyText: 'y', clientId: 99 })
      expect(res.ok).toBe(false)
      expect((res as { error?: string }).error).toContain('no pertenece a este workspace')
      expect(created).toHaveLength(0)
    })

    it('rechaza usuarios sin permiso de edición', async () => {
      const { payload } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload, canEdit: false }) as never)

      const res = await createNoteAction({ title: 'x', bodyText: 'y' })
      expect(res.ok).toBe(false)
      expect((res as { error?: string }).error).toContain('permiso')
    })
  })

  describe('toggleNotePinAction', () => {
    it('invierte el estado pinned de la nota', async () => {
      const { payload, updated } = mockPayloadFactory({ notes: [{ id: 3, pinned: false, tenant: 1 }] })
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await toggleNotePinAction({ noteId: 3 })
      expect(res.ok).toBe(true)
      expect(updated).toHaveLength(1)
      expect(updated[0].data.pinned).toBe(true)
    })
  })

  describe('deleteNoteAction', () => {
    it('permite eliminar solo a admin', async () => {
      const { payload, deleted } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload, isAdmin: true }) as never)

      const res = await deleteNoteAction({ noteId: 9 })
      expect(res.ok).toBe(true)
      expect(deleted).toEqual([9])
    })

    it('bloquea la eliminación a no-admin', async () => {
      const { payload, deleted } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload, isAdmin: false }) as never)

      const res = await deleteNoteAction({ noteId: 9 })
      expect(res.ok).toBe(false)
      expect((res as { error?: string }).error).toContain('administrador')
      expect(deleted).toHaveLength(0)
    })
  })
})

describe('searchNoteRelatedAction — permisos y scoping', () => {
  function mockSearchPayload({ canEdit = true }: { canEdit?: boolean } = {}) {
    const payload = {
      find: vi.fn(({ collection }: { collection: string }) =>
        Promise.resolve({
          docs:
            collection === 'clients'
              ? [{ id: 9, tenant: 1, name: 'Cliente Test', phone: '5841211' }]
              : [],
          totalDocs: 1,
        }),
      ),
    } as unknown as Payload
    const context = makeContext({ payload, canEdit })
    return context
  }

  it('devuelve resultados acotados al tenant para editores', async () => {
    mockedContext.mockResolvedValue(mockSearchPayload() as never)
    const res = await searchNoteRelatedAction({ q: 'Test', type: 'client' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.results[0].label).toContain('Cliente Test')
  })

  it('rechaza a viewers (no pueden enumerar contactos)', async () => {
    mockedContext.mockResolvedValue(mockSearchPayload({ canEdit: false }) as never)
    const res = await searchNoteRelatedAction({ q: 'Test', type: 'client' })
    expect(res.ok).toBe(false)
    expect((res as { error?: string }).error).toContain('No tienes permiso')
  })
})

describe('extractPlainTextFromLexical & updateNoteAction', () => {
  it('extrae texto plano correctamente de un árbol Lexical', async () => {
    const lexical = await buildLexicalFromPlainText('Línea 1\nLínea 2\n\nPárrafo 2')
    const plain = extractPlainTextFromLexical(lexical)
    expect(plain).toContain('Línea 1')
    expect(plain).toContain('Párrafo 2')
  })

  it('actualiza una nota existente correctamente', async () => {
    const { payload, updated } = mockPayloadFactory({
      notes: [{ id: 42, tenant: 1, title: 'Nota vieja', body: {} }],
    })
    mockedContext.mockResolvedValue(makeContext({ payload }) as never)

    const res = await updateNoteAction({
      noteId: 42,
      title: 'Nota actualizada',
      bodyText: '- [ ] Nueva tarea',
      category: 'idea',
      pinned: true,
    })

    expect(res.ok).toBe(true)
    expect(updated).toHaveLength(1)
    expect(updated[0].id).toBe(42)
    expect(updated[0].data.title).toBe('Nota actualizada')
    expect(updated[0].data.category).toBe('idea')
    expect(updated[0].data.pinned).toBe(true)
  })

  it('preserva el árbol Lexical enriquecido si el cuerpo de texto no se modificó', async () => {
    const complexBody = {
      root: {
        type: 'root',
        children: [
          {
            type: 'heading',
            tag: 'h2',
            children: [{ type: 'text', text: 'Encabezado Importante' }],
          },
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: 'Enlace a ' },
              {
                type: 'link',
                fields: { url: 'https://example.com' },
                children: [{ type: 'text', text: 'Sitio Web' }],
              },
            ],
          },
          {
            type: 'horizontalrule',
          },
        ],
      },
    }

    const { payload, updated } = mockPayloadFactory({
      notes: [{ id: 99, tenant: 1, title: 'Nota Rica', body: complexBody }],
    })
    mockedContext.mockResolvedValue(makeContext({ payload }) as never)

    // Solo cambiamos metadata (título y categoría), pasando el mismo plain text extraído
    const plainText = extractPlainTextFromLexical(complexBody)
    const res = await updateNoteAction({
      noteId: 99,
      title: 'Nota Rica Renombrada',
      bodyText: plainText,
      category: 'cliente',
    })

    expect(res.ok).toBe(true)
    expect(updated).toHaveLength(1)
    expect(updated[0].data.title).toBe('Nota Rica Renombrada')
    expect(updated[0].data.category).toBe('cliente')
    // Crucial: body NO debe haberse sobreescrito con texto plano aplanado
    expect(updated[0].data.body).toBeUndefined()
  })

  it('detecta correctamente si un documento Lexical contiene nodos enriquecidos', () => {
    const simpleDoc = {
      root: {
        children: [
          { type: 'paragraph', children: [{ type: 'text', text: 'Simple texto' }] },
        ],
      },
    }
    expect(hasComplexLexicalNodes(simpleDoc)).toBe(false)

    const docWithHeading = {
      root: {
        children: [{ type: 'heading', children: [{ type: 'text', text: 'Título H2' }] }],
      },
    }
    expect(hasComplexLexicalNodes(docWithHeading)).toBe(true)

    const docWithLink = {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [{ type: 'link', children: [{ type: 'text', text: 'Link' }] }],
          },
        ],
      },
    }
    expect(hasComplexLexicalNodes(docWithLink)).toBe(true)

    const docWithRule = {
      root: {
        children: [{ type: 'horizontalrule' }],
      },
    }
    expect(hasComplexLexicalNodes(docWithRule)).toBe(true)
  })
})
