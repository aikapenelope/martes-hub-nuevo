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
})
