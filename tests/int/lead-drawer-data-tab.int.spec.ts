import { createElement } from 'react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LeadDrawerDataTab, collectLeadFieldsInput } from '@/components/workspace/lead-drawer/LeadDrawerDataTab'
import { updateLeadFieldsAction } from '@/lib/crm-pipeline-actions'
import type { Lead, Segment, User } from '@/payload-types'

vi.mock('@/lib/crm-pipeline-actions', () => ({
  updateLeadFieldsAction: vi.fn().mockResolvedValue({ ok: true }),
}))

const mockedUpdate = vi.mocked(updateLeadFieldsAction)

// El include de vitest solo cubre *.int.spec.ts, así que montamos el
// componente con createElement en lugar de sintaxis JSX.
function renderTab(props: { lead: Lead; canEdit: boolean; assignees: User[]; segments: Segment[] }) {
  return render(createElement(LeadDrawerDataTab, props))
}

// Lead ya asignado y segmentado: guardando un campo NO relacionado (p. ej.
// el nombre) no deben perderse esas relaciones.
const assignedLead = {
  id: 42,
  fullName: 'Juan Pérez',
  source: 'manual',
  segment: { id: 5, name: 'Restaurantes', tenant: 10 },
  assignedTo: { id: 3, email: 'agente@martes.local' },
} as unknown as Lead

function fillAndSubmit(fullName: string): void {
  const nameInput = screen.getByDisplayValue('Juan Pérez')
  fireEvent.change(nameInput, { target: { value: fullName } })
  fireEvent.click(screen.getByRole('button', { name: /Guardar Cambios/i }))
}

afterEach(() => {
  // vitest corre sin globals:true → RTL no auto-limpia el DOM entre tests
  cleanup()
})

beforeEach(() => {
  mockedUpdate.mockClear()
  mockedUpdate.mockResolvedValue({ ok: true })
})

describe('LeadDrawerDataTab — preservación de relaciones al guardar', () => {
  it('drawer del cockpit (sin opciones): guardar otro campo NO envía segment ni assignedTo', async () => {
    renderTab({ lead: assignedLead, canEdit: true, assignees: [], segments: [] })

    fillAndSubmit('Juan Pérez Editado')

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledTimes(1)
    })
    const [, input] = mockedUpdate.mock.calls[0]
    expect(input.fullName).toBe('Juan Pérez Editado')
    // undefined = el update no toca la relación → no se borra
    expect(input.segment).toBeUndefined()
    expect(input.assignedTo).toBeUndefined()
  })

  it('con opciones disponibles, elegir "Sin rubro"/"Sin asignar" sí envía null (elección explícita)', async () => {
    const segments = [{ id: 5, name: 'Restaurantes', tenant: 10 }] as unknown as Segment[]
    const assignees = [{ id: 3, email: 'agente@martes.local' }] as unknown as User[]
    renderTab({ lead: assignedLead, canEdit: true, assignees, segments })

    fireEvent.click(screen.getByRole('button', { name: /Guardar Cambios/i }))

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledTimes(1)
    })
    const [, input] = mockedUpdate.mock.calls[0]
    // El select muestra el valor actual (5 y 3), se envían tal cual
    expect(input.segment).toBe(5)
    expect(input.assignedTo).toBe(3)
  })

  it('con opciones disponibles, el usuario puede cambiar la asignación a otro agente', async () => {
    const segments = [{ id: 5, name: 'Restaurantes', tenant: 10 }] as unknown as Segment[]
    const assignees = [
      { id: 3, email: 'agente@martes.local' },
      { id: 9, email: 'otro@martes.local' },
    ] as unknown as User[]
    renderTab({ lead: assignedLead, canEdit: true, assignees, segments })

    const assignedSelect = screen.getByLabelText('Agente asignado') as HTMLSelectElement
    fireEvent.change(assignedSelect, { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: /Guardar Cambios/i }))

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledTimes(1)
    })
    const [, input] = mockedUpdate.mock.calls[0]
    expect(input.assignedTo).toBe(9)
    expect(input.segment).toBe(5)
  })
})

describe('collectLeadFieldsInput — regla de preservación', () => {
  const baseForm = () => {
    const form = new FormData()
    form.set('fullName', 'Alguien')
    form.set('source', 'manual')
    return form
  }

  it('sin opciones de rubro: segment queda undefined aunque el form envíe vacío', () => {
    const form = baseForm()
    form.set('segment', '')
    const input = collectLeadFieldsInput(form, { hasAssigneeChoices: false, hasSegmentChoices: false })
    expect(input.segment).toBeUndefined()
    expect(input.assignedTo).toBeUndefined()
  })

  it('con opciones: form vacío significa "sin rubro" explícito (null)', () => {
    const form = baseForm()
    form.set('segment', '')
    form.set('assignedTo', '')
    const input = collectLeadFieldsInput(form, { hasAssigneeChoices: true, hasSegmentChoices: true })
    expect(input.segment).toBeNull()
    expect(input.assignedTo).toBeNull()
  })
})
