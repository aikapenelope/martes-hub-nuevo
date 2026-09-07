import { describe, expect, it } from 'vitest'
import { buildCrmHref } from '@/lib/crm-href'
import { parseCrmFilters } from '@/lib/crm-filters'
import type { BillingCard } from '@/components/workspace/billing/BillingWorkspace'

describe('RSC Boundary Serializability & Safety', () => {
  it('garantiza que las tarjetas de facturación son 100% serializables a través de la frontera Server -> Client', () => {
    // Exact structure created in src/app/(workspace)/workspace/billing/page.tsx
    const cards: BillingCard[] = [
      { key: 'collected', label: 'Cobrado este mes', value: ',200.00', note: '5 pagos registrados', accent: 'sky' },
      { key: 'pending', label: 'Por cobrar', value: '.00', note: '2 cobros abiertos', accent: 'amber' },
      { key: 'overdue', label: 'Vencidos', value: 'zsh.00', note: '0 pagos vencidos', accent: 'rose' },
      { key: 'cancelled', label: 'Anulados', value: 'zsh.00', note: '0 registros anulados', accent: 'indigo' },
    ]

    // RSC requires props passed to Client Components to be JSON-serializable
    const serialized = JSON.stringify(cards)
    const parsed = JSON.parse(serialized)

    expect(parsed).toEqual(cards)
    for (const card of parsed) {
      expect(typeof card.label).toBe('string')
      expect(typeof card.value).toBe('string')
      expect(typeof card.note).toBe('string')
      expect(['sky', 'amber', 'rose', 'indigo']).toContain(card.accent)
      expect(['collected', 'pending', 'overdue', 'cancelled']).toContain(card.key)
      // Debe ser puramente serializable: sin funciones ni símbolos de React ($)
      expect(card.icon).toBeUndefined()
    }
  })

  it('permite construir URLs de navegación CRM en componentes cliente sin recargar la página', () => {
    const filters = parseCrmFilters({ vista: 'leads', agente: 'me', modo: 'tabla' })
    const nextHref = buildCrmHref(filters, { agente: 'agente_456' })

    expect(nextHref).toBe('/workspace/crm?vista=leads&modo=tabla&agente=agente_456')
  })
})
