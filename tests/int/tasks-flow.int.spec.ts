import { describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import configPromise from '@/payload.config'

describe('Flujo integral de Tareas: creación, detalle, actualización y borrado', () => {
  it('permite crear, consultar con depth 1, modificar y eliminar tareas sin error de locking', async () => {
    const payload = await getPayload({ config: configPromise })
    const user = (await payload.find({ collection: 'users', limit: 1 })).docs[0]
    const tenant = (await payload.find({ collection: 'tenants', limit: 1 })).docs[0]

    expect(user).toBeDefined()
    expect(tenant).toBeDefined()

    // 1. Crear tarea con responsable, fecha y checklist
    const task = await payload.create({
      collection: 'tasks',
      overrideAccess: false,
      user,
      data: {
        title: 'Tarea de prueba E2E ' + Date.now(),
        description: 'Descripción inicial para verificación de persistencia',
        status: 'pendiente',
        priority: 'alta',
        dueDate: '2026-09-15T12:00:00.000Z',
        assignedTo: user.id,
        tenant: tenant.id,
        source: 'manual',
        checklist: [
          { item: 'Subtarea 1: Configurar entorno', done: false },
          { item: 'Subtarea 2: Ejecutar validaciones', done: true },
        ],
      },
    })

    expect(task.id).toBeTypeOf('number')
    expect(task.title).toContain('Tarea de prueba E2E')
    expect(task.checklist).toHaveLength(2)

    // 2. Consulta de detalle de tarea con depth 1 (emula TaskDetailPage)
    const detailResult = await payload.find({
      collection: 'tasks',
      depth: 1,
      limit: 1,
      overrideAccess: false,
      user,
      where: {
        and: [
          { id: { equals: task.id } },
          { tenant: { equals: tenant.id } },
        ],
      },
    })

    const fetchedTask = detailResult.docs[0]
    expect(fetchedTask).toBeDefined()
    expect(fetchedTask.id).toBe(task.id)
    expect(typeof fetchedTask.assignedTo).toBe('object')
    const assignedUser = fetchedTask.assignedTo as { id: number } | null
    expect(assignedUser?.id).toBe(user.id)

    // 3. Actualización de tarea (emula updateTaskAction: cambio de estado y checklist)
    const updated = await payload.update({
      collection: 'tasks',
      id: task.id,
      overrideAccess: false,
      user,
      data: {
        status: 'en_progreso',
        checklist: [
          { item: 'Subtarea 1: Configurar entorno', done: true },
          { item: 'Subtarea 2: Ejecutar validaciones', done: true },
        ],
      },
    })

    expect(updated.status).toBe('en_progreso')
    expect(updated.checklist?.every((i) => i.done)).toBe(true)

    // 4. Eliminación de tarea (emula deleteTaskAction y dispara checkDocumentLockStatus)
    const deleted = await payload.delete({
      collection: 'tasks',
      id: task.id,
      overrideAccess: false,
      user,
    })

    expect(deleted.id).toBe(task.id)

    // 5. Confirmar que ya no existe
    const verifyResult = await payload.find({
      collection: 'tasks',
      limit: 1,
      where: { id: { equals: task.id } },
    })
    expect(verifyResult.totalDocs).toBe(0)
  })

  it('permite buscar usuarios asignables incluyendo administradores', async () => {
    const payload = await getPayload({ config: configPromise })
    const tenant = (await payload.find({ collection: 'tenants', limit: 1 })).docs[0]

    const users = await payload.find({
      collection: 'users',
      limit: 50,
      overrideAccess: true,
      where: {
        and: [
          { active: { not_equals: false } },
          {
            or: [
              { 'tenants.tenant': { equals: tenant.id } },
              { roles: { contains: 'admin' } },
            ],
          },
        ],
      },
    })

    expect(users.docs.length).toBeGreaterThan(0)
  })
})
