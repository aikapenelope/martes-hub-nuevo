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

const DOC_UPDATED_AT = '2026-01-01T00:00:00.000Z'
const NEW_UPDATED_AT = '2026-02-02T00:00:00.000Z'

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

    const countCalls: Array<Record<string, unknown>> = []
  const payload = {
    count: vi.fn((args: Record<string, unknown>) => {
      countCalls.push(args)
      return Promise.resolve({ totalDocs: totalBoards })
    }),
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
      return Promise.resolve({
        docs: doc ? [{ updatedAt: DOC_UPDATED_AT, ...doc }] : [],
        totalDocs: doc ? 1 : 0,
      })
    }),
    create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
      const doc = { id: nextId++, updatedAt: NEW_UPDATED_AT, ...data }
      created.push(doc)
      return Promise.resolve(doc)
    }),
    update: vi.fn(({ id, data }: { id: number; data: Record<string, unknown> }) => {
      updated.push({ id, data })
      return Promise.resolve({ id, updatedAt: NEW_UPDATED_AT })
    }),
    delete: vi.fn(({ id }: { id: number }) => {
      deleted.push(id)
      return Promise.resolve({ id })
    }),
  } as unknown as Payload

  return { payload, created, updated, deleted, countCalls }
}

const VALID_SCENE = { elements: [{ id: 'a', type: 'rectangle' }], files: {} }

describe('Whiteboard — acciones del workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createWhiteboardAction', () => {
    it('crea la pizarra con tenant y escena vacía compartida', async () => {
      const { payload, created, countCalls } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await createWhiteboardAction('Reto Q4')

      expect(res.ok).toBe(true)
      if (res.ok) expect(res.updatedAt).toBe(NEW_UPDATED_AT)
      expect(created).toHaveLength(1)
      expect(created[0].tenant).toBe(1)
      expect(created[0].title).toBe('Reto Q4')
      expect(created[0].source).toBe('local')
      expect((created[0].scene as { elements: unknown[] }).elements).toEqual([])
      // Cuota por tenant explícita: sin esto, un admin contaría pizarras de todos sus workspaces
      expect(countCalls[0]?.where).toEqual({ tenant: { equals: 1 } })
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

      const res = await saveWhiteboardAction(3, VALID_SCENE, 'data:image/jpeg;base64,abc', DOC_UPDATED_AT)

      expect(res.ok).toBe(true)
      if (res.ok) expect(res.updatedAt).toBe(NEW_UPDATED_AT)
      expect(updated).toHaveLength(1)
      expect(updated[0].id).toBe(3)
      expect((updated[0].data.scene as { elements: unknown[] }).elements).toHaveLength(1)
      expect(updated[0].data.thumbnail).toBe('data:image/jpeg;base64,abc')
    })

    it('rechaza con conflicto si la revisión base ya no es la vigente', async () => {
      const { payload, updated } = mockPayloadFactory({ existing: [{ id: 3, tenant: 1, title: 'Compartida' }] })
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await saveWhiteboardAction(3, VALID_SCENE, null, '2026-06-01T00:00:00.000Z')

      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.conflict).toBe(true)
        expect(res.serverUpdatedAt).toBe(DOC_UPDATED_AT)
      }
      expect(updated).toHaveLength(0)
    })

    it('guarda sin expectativa cuando no se pasa revisión base (compat)', async () => {
      const { payload, updated } = mockPayloadFactory({ existing: [{ id: 3, tenant: 1 }] })
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await saveWhiteboardAction(3, VALID_SCENE)
      expect(res.ok).toBe(true)
      expect(updated).toHaveLength(1)
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

      const giant = { elements: [{ id: 'a', type: 'rectangle', blob: 'x'.repeat(MAX_SCENE_BYTES + 10) }], files: {} }
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
        expect(res.updatedAt).toBe(DOC_UPDATED_AT)
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
      const { payload, created, countCalls } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const file = JSON.stringify({ type: 'excalidraw', version: 2, source: 'excalidraw.com', elements: [{ id: 'x', type: 'rectangle' }], files: {} })
      const res = await importWhiteboardAction('Mapa mental', file)

      expect(res.ok).toBe(true)
      if (res.ok) expect(res.updatedAt).toBe(NEW_UPDATED_AT)
      expect(created).toHaveLength(1)
      expect(created[0].tenant).toBe(1)
      expect(created[0].source).toBe('import')
      expect(created[0].title).toBe('Mapa mental')
      expect((created[0].scene as { elements: unknown[] }).elements).toHaveLength(1)
      expect(countCalls[0]?.where).toEqual({ tenant: { equals: 1 } })
    })

    it('importa una escena cruda { elements }', async () => {
      const { payload, created } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await importWhiteboardAction('Escena', JSON.stringify({ elements: [{ id: 'y', type: 'ellipse' }] }))
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

      const giant = JSON.stringify({ elements: [{ id: 'a', type: 'rectangle', blob: 'x'.repeat(MAX_SCENE_BYTES + 10) }] })
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

  describe('validación estructural de escenas', () => {
    it('rechaza elementos sin id/type', async () => {
      const { payload, created } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await importWhiteboardAction('X', JSON.stringify({ elements: [{ foo: 1 }] }))
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toContain('sin id/type')
      expect(created).toHaveLength(0)
    })

    it('rechaza elements que no son objetos planos', async () => {
      const { payload, created } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await importWhiteboardAction('X', JSON.stringify({ elements: ['texto suelto'] }))
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toContain('Escena inválida')
      expect(created).toHaveLength(0)
    })

    it('poda appState a las claves permitidas (viewport/fondo)', async () => {
      const { payload, created } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const file = JSON.stringify({
        type: 'excalidraw',
        elements: [{ id: 'a', type: 'rectangle' }],
        files: {},
        appState: { viewBackgroundColor: '#ffffff', scrollX: 10, zoom: 1, activeTool: { type: 'weapon' }, userInput: 'junk' },
      })
      const res = await importWhiteboardAction('X', file)
      expect(res.ok).toBe(true)
      const scene = created[0].scene as { appState: Record<string, unknown> }
      expect(scene.appState).toEqual({ viewBackgroundColor: '#ffffff', scrollX: 10, zoom: 1 })
    })

    it('rechaza files con valores que no son objetos planos', async () => {
      const { payload, created } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await importWhiteboardAction('X', JSON.stringify({ elements: [{ id: 'a', type: 'image' }], files: { f1: 'data:text/html,inyectado' } }))
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toContain('archivo embebido')
      expect(created).toHaveLength(0)
    })

    it('rechaza archivos embebidos cuyo dataURL no es texto', async () => {
      const { payload, created } = mockPayloadFactory()
      mockedContext.mockResolvedValue(makeContext({ payload }) as never)

      const res = await importWhiteboardAction('X', JSON.stringify({
        elements: [{ id: 'a', type: 'image' }],
        files: { f1: { id: 'f1', dataURL: { mal: true } } },
      }))
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).toContain('dataURL')
      expect(created).toHaveLength(0)
    })
  })
})
