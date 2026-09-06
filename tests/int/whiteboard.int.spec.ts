import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { Payload } from 'payload'
import type { User } from '@/payload-types'
import {
  createWhiteboardAction,
  deleteWhiteboardAction,
  importWhiteboardAction,
  loadWhiteboardSceneAction,
  saveWhiteboardAction,
} from '@/lib/whiteboard-actions'
import { MAX_BOARDS_PER_TENANT, MAX_SCENE_BYTES } from '@/collections/Whiteboards'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/workspace-context', () => ({ getWorkspaceContext: vi.fn() }))

import { getWorkspaceContext } from '@/lib/workspace-context'
const mockedContext = vi.mocked(getWorkspaceContext)

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

function mockPayloadFactory({
  existing = [],
  totalBoards = 0,
}: {
  existing?: Array<Record<string, unknown>>
  totalBoards?: number
} = {}) {
  const created: Array<Record<string, unknown>> = []
  const updated: Array<{ id: number; data: Record<string, unknown> }> = []
  const deleted: number[] = []
  let nextId = existing.length + 1

  const payload = {
    count: vi.fn(() => Promise.resolve({ totalDocs: totalBoards })),
    find: vi.fn(({ where }: { where?: Record<string, unknown> }) => {
      // scopedWhiteboard filtra por id + tenant; simulamos el aislamiento real
      const and = (where as { and?: Array<Record<string, unknown>> })?.and ?? []
      const idCond = and.find((c) => 'id' in c) as { id: { equals: number } } | undefined
      const tenantCond = and.find((c) => 'tenant' in c) as { tenant: { equals: number } } | undefined
      const doc = existing.find(
        (d) =>
          d.id === idCond?.id.equals &&
          (d.tenant === tenantCond?.tenant.equals || d.tenant === (tenantCond?.tenant.equals as unknown)),
      )
      return Promise.resolve({ docs: doc ? [doc] : [], totalDocs: doc ? 1 : 0 })
    }),
    create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
      const doc = { id: nextId++, ...data }
      created.push(doc)
      return Promise.resolve(doc)
    }),
    update: vi.fn(({ id, data }: { id: number; data: Record<string, unknown> }) => {
      updated.push({ id, data })
      return Promise.resolve({ id })
    }),
    delete: vi.fn(({ id }: { id: number }) => {
      deleted.push(id)
      return Promise.resolve({ id })
    }),
  } as unknown as Payload

  return { payload, created, updated, deleted }
}

const VALID_SCENE = { elements: [{ id: 'a', type: 'rectangle' }], files: {} }

describe('Whiteboard — acciones del workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createWhiteboardAction', () => {
    it('crea la pizarra con tenant y escena vacía compartida', async () => {
      const { payload, created } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await createWhiteboardAction('Reto Q4')

      expect(res.ok).toBe(true)
      expect(created).toHaveLength(1)
      expect(created[0].tenant).toBe(1)
      expect(created[0].title).toBe('Reto Q4')
      expect(created[0].source).toBe('local')
      expect((created[0].scene as { elements: unknown[] }).elements).toEqual([])
    })

    it('rechaza sin permiso de edición (viewer)', async () => {
      const { payload } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload, canEdit: false }) as never)

      await expect(createWhiteboardAction('Reto')).rejects.toThrow('No tienes permiso')
    })

    it('respeta el límite de pizarras por tenant', async () => {
      const { payload } = mockPayloadFactory({ totalBoards: MAX_BOARDS_PER_TENANT })
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await createWhiteboardAction('Reto')
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toContain('Límite')
    })
  })

  describe('saveWhiteboardAction', () => {
    it('guarda la escena de una pizarra del tenant activo', async () => {
      const { payload, updated } = mockPayloadFactory({ existing: [{ id: 3, tenant: 1, title: 'Reto' }] })
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await saveWhiteboardAction(3, VALID_SCENE, 'data:image/jpeg;base64,abc')

      expect(res.ok).toBe(true)
      expect(updated).toHaveLength(1)
      expect(updated[0].id).toBe(3)
      expect((updated[0].data.scene as { elements: unknown[] }).elements).toHaveLength(1)
      expect(updated[0].data.thumbnail).toBe('data:image/jpeg;base64,abc')
    })

    it('no guarda pizarras de otro tenant', async () => {
      const { payload, updated } = mockPayloadFactory({ existing: [{ id: 3, tenant: 999, title: 'Ajena' }] })
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      await expect(saveWhiteboardAction(3, VALID_SCENE)).rejects.toThrow('no encontrada en el tenant activo')
      expect(updated).toHaveLength(0)
    })

    it('rechaza escenas que superan el límite de tamaño', async () => {
      const { payload, updated } = mockPayloadFactory({ existing: [{ id: 3, tenant: 1 }] })
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const giant = { elements: [{ blob: 'x'.repeat(MAX_SCENE_BYTES + 10) }], files: {} }
      await expect(saveWhiteboardAction(3, giant)).rejects.toThrow('supera el límite')
      expect(updated).toHaveLength(0)
    })

    it('descarta thumbnails demediados sin fallar el guardado', async () => {
      const { payload, updated } = mockPayloadFactory({ existing: [{ id: 3, tenant: 1 }] })
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await saveWhiteboardAction(3, VALID_SCENE, 'data:image/jpeg;base64,' + 'x'.repeat(600 * 1024))
      expect(res.ok).toBe(true)
      expect(updated[0].data.thumbnail).toBeNull()
    })
  })

  describe('loadWhiteboardSceneAction', () => {
    it('devuelve la escena normalizada', async () => {
      const { payload } = mockPayloadFactory({
        existing: [{ id: 5, tenant: 1, scene: { elements: [{ id: 'a' }], files: undefined } }],
      })
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await loadWhiteboardSceneAction(5)
      expect(res.ok).toBe(true)
      if (res.ok) {
        expect(res.scene.elements).toHaveLength(1)
        expect(res.scene.files).toEqual({})
      }
    })
  })

  describe('deleteWhiteboardAction', () => {
    it('solo un admin borra pizarras', async () => {
      const { payload, deleted } = mockPayloadFactory({ existing: [{ id: 3, tenant: 1 }] })
      mockedContext.mockResolvedValue(makeContext({ payload, isAdmin: false }) as never)

      const res = await deleteWhiteboardAction(3)
      expect(res.ok).toBe(false)
      expect(deleted).toHaveLength(0)

      mockedContext.mockResolvedValue(makeContext({ payload, isAdmin: true }) as never)
      const resAdmin = await deleteWhiteboardAction(3)
      expect(resAdmin.ok).toBe(true)
      expect(deleted).toEqual([3])
    })
  })

  describe('importWhiteboardAction', () => {
    it('importa un archivo exportado de Excalidraw ({ type: excalidraw })', async () => {
      const { payload, created } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const file = JSON.stringify({ type: 'excalidraw', version: 2, source: 'excalidraw.com', elements: [{ id: 'x' }], files: {} })
      const res = await importWhiteboardAction('Mapa mental', file)

      expect(res.ok).toBe(true)
      expect(created).toHaveLength(1)
      expect(created[0].tenant).toBe(1)
      expect(created[0].source).toBe('import')
      expect(created[0].title).toBe('Mapa mental')
      expect((created[0].scene as { elements: unknown[] }).elements).toHaveLength(1)
    })

    it('importa una escena cruda { elements }', async () => {
      const { payload, created } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await importWhiteboardAction('Escena', JSON.stringify({ elements: [{ id: 'y' }] }))
      expect(res.ok).toBe(true)
      expect(created).toHaveLength(1)
    })

    it('rechaza JSON inválido y archivos sin elements', async () => {
      const { payload, created } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const badJson = await importWhiteboardAction('X', '{no soy json')
      expect(badJson.ok).toBe(false)

      const noElements = await importWhiteboardAction('X', JSON.stringify({ foo: 'bar' }))
      expect(noElements.ok).toBe(false)
      expect(created).toHaveLength(0)
    })

    it('rechaza archivos que superan el límite de tamaño', async () => {
      const { payload, created } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const giant = JSON.stringify({ elements: [{ blob: 'x'.repeat(MAX_SCENE_BYTES + 10) }] })
      const res = await importWhiteboardAction('X', giant)
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toContain('límite')
      expect(created).toHaveLength(0)
    })

    it('respeta el límite de pizarras por tenant', async () => {
      const { payload, created } = mockPayloadFactory({ totalBoards: MAX_BOARDS_PER_TENANT })
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await importWhiteboardAction('X', JSON.stringify({ elements: [{ id: 'z' }] }))
      expect(res.ok).toBe(false)
      expect(created).toHaveLength(0)
    })
  })
})
