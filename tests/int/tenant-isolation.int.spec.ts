import { describe, it, expect } from 'vitest'
import { parseCrmFilters } from '@/lib/crm-filters'
import { parseTaskFilters } from '@/lib/tasks-filters'

describe('Seguridad de Aislamiento y Filtros Multi-Tenant', () => {
  describe('parseCrmFilters', () => {
    it('sanea parámetros maliciosos y acota límites de página', () => {
      const filters = parseCrmFilters({
        vista: 'leads',
        estado: 'sql-injection-attempt',
        q: '  A'.repeat(200),
        page: '-999',
      })

      expect(filters.view).toBe('leads')
      expect(filters.status).toBe('todos') // Rechaza valores fuera del enum
      expect(filters.query.length).toBeLessThanOrEqual(120)
      expect(filters.page).toBe(1)
    })

    it('restringe estados según la vista seleccionada para evitar fuga de filtros', () => {
      // 'perdido' es válido en clientes, pero debe ser rechazado si la vista es leads
      const leadFilters = parseCrmFilters({ vista: 'leads', estado: 'perdido' })
      expect(leadFilters.status).toBe('todos')

      // 'descartado' es válido en leads, pero debe ser rechazado si la vista es clientes
      const clientFilters = parseCrmFilters({ vista: 'clientes', estado: 'descartado' })
      expect(clientFilters.stage).toBe('todos')
    })
  })

  describe('parseTaskFilters', () => {
    it('restringe prioridades y estados al allowlist estricto', () => {
      const filters = parseTaskFilters({
        vista: 'tablero',
        estado: 'hack_status',
        prioridad: 'super_high',
        responsable: 'abc', // ID no numérico
        vencimiento: 'invalid_date_range',
      })

      expect(filters.status).toBe('todos')
      expect(filters.priority).toBe('todas')
      expect(filters.assignee).toBe('todos')
      expect(filters.due).toBe('todos')
    })

    it('parsea responsables numéricos válidos con tipo number seguro', () => {
      const filters = parseTaskFilters({ responsable: '42' })
      expect(filters.assignee).toBe(42)
    })
  })

  describe('Validación de Aislamiento y Timing-Safety', () => {
    it('compara buffers de forma constante para evitar ataques de timing', async () => {
      const crypto = await import('crypto')
      const secret = 'super-secret-token-value-12345678'
      const provided = 'super-secret-token-value-12345678'
      const attacker = 'wrong-secret-token-value-12345678'

      const bufSecret = Buffer.from(secret)
      const bufProvided = Buffer.from(provided)
      const bufAttacker = Buffer.from(attacker)

      expect(crypto.timingSafeEqual(bufSecret, bufProvided)).toBe(true)
      expect(crypto.timingSafeEqual(bufSecret, bufAttacker)).toBe(false)
    })
  })

  describe('Control de Acceso Multi-Tenant en Colecciones', () => {
    it('Users.access.read restringe la visibilidad de usuarios no-admin a sus mismos tenants', async () => {
      const { Users } = await import('@/collections/Users')
      const readAccess = Users.access?.read
      expect(typeof readAccess).toBe('function')

      if (typeof readAccess === 'function') {
        // 1. No autenticado -> false
        expect(readAccess({ req: {} as never })).toBe(false)

        // 2. Admin global -> true
        expect(
          readAccess({
            req: {
              user: { id: 1, roles: ['admin'] },
            } as never,
          }),
        ).toBe(true)

        // 3. Agente en Tenant 10 -> consulta acotada a sí mismo y a usuarios de su tenant
        const agentConstraint = readAccess({
          req: {
            user: { id: 42, roles: ['agente'], tenants: [{ tenant: 10 }] },
          } as never,
        })
        expect(agentConstraint).toEqual({
          or: [
            { id: { equals: 42 } },
            { 'tenants.tenant': { in: [10] } },
          ],
        })
      }
    })

    it('Clients assignedAgent filterOptions acota los agentes al tenant activo', async () => {
      const { Clients } = await import('@/collections/Clients')
      const assignedAgentField = Clients.fields.find(
        (f) => 'name' in f && f.name === 'assignedAgent',
      ) as { filterOptions?: (args: { data?: { tenant?: number } }) => unknown } | undefined
      expect(assignedAgentField).toBeDefined()
      expect(typeof assignedAgentField?.filterOptions).toBe('function')

      const filter = assignedAgentField?.filterOptions?.({
        data: { tenant: 5 },
      })
      expect(filter).toEqual({
        roles: { in: ['admin', 'agente'] },
        active: { equals: true },
        'tenants.tenant': { in: [5] },
      })
    })
  })
})
