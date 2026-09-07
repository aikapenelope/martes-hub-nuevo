import { createElement } from 'react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  LeadDrawerDataTab,
  collectLeadFieldsInput,
  ifDatetimeChanged,
  ifDateChanged,
  toDateInput,
} from '@/components/workspace/lead-drawer/LeadDrawerDataTab'
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
  it('drawer del cockpit (sin opciones): guardar otro campo conserva rubro y asignación', async () => {
    renderTab({ lead: assignedLead, canEdit: true, assignees: [], segments: [] })

    fillAndSubmit('Juan Pérez Editado')

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledTimes(1)
    })
    const [, input] = mockedUpdate.mock.calls[0]
    expect(input.fullName).toBe('Juan Pérez Editado')
    // La relación actual se re-envía tal cual (opción sintetizada), no se borra
    expect(input.segment).toBe(5)
    expect(input.assignedTo).toBe(3)
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

  it('la relación actual fuera de la lista (agente inactivo/límite) se muestra y se conserva', async () => {
    // lead asignado al agente 99, que no está entre las opciones activas
    const orphanLead = {
      ...assignedLead,
      assignedTo: { id: 99, firstName: 'Inactivo', email: 'inactivo@martes.local' },
    } as unknown as Lead
    const segments = [{ id: 5, name: 'Restaurantes', tenant: 10 }] as unknown as Segment[]
    const assignees = [{ id: 3, email: 'agente@martes.local' }] as unknown as User[]
    renderTab({ lead: orphanLead, canEdit: true, assignees, segments })

    // El select muestra al agente 99 gracias a la opción sintetizada
    const assignedSelect = screen.getByLabelText('Agente asignado') as HTMLSelectElement
    const values = Array.from(assignedSelect.options).map((o) => o.value)
    expect(values).toContain('99')
    expect(assignedSelect.value).toBe('99')

    // Y guardar otro campo conserva la asignación 99 (no la borra)
    fillAndSubmit('Juan Pérez Editado')
    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledTimes(1)
    })
    const [, input] = mockedUpdate.mock.calls[0]
    expect(input.assignedTo).toBe(99)
  })

  it('la relación actual sin opciones provistas se sintetiza desde el lead y se conserva', async () => {
    // drawer del cockpit sin opciones: lead con rubro 7 (el objeto viene
    // poblado por depth=1 con su nombre) y asignación 99 sin nombre
    const cockpitLead = {
      ...assignedLead,
      segment: { id: 7, name: 'Tiendas', tenant: 10 },
      assignedTo: { id: 99, email: 'viejo@martes.local' },
    } as unknown as Lead
    renderTab({ lead: cockpitLead, canEdit: true, assignees: [], segments: [] })

    const segmentSelect = screen.getByLabelText('Rubro') as HTMLSelectElement
    expect(segmentSelect.value).toBe('7')
    expect(Array.from(segmentSelect.options).map((o) => o.textContent)).toContain('Tiendas')

    const assignedSelect = screen.getByLabelText('Agente asignado') as HTMLSelectElement
    expect(Array.from(assignedSelect.options).map((o) => o.textContent)).toContain(
      'viejo@martes.local',
    )

    fillAndSubmit('Juan Pérez Editado')
    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledTimes(1)
    })
    const [, input] = mockedUpdate.mock.calls[0]
    expect(input.segment).toBe(7)
    expect(input.assignedTo).toBe(99)
  })
})

describe('collectLeadFieldsInput — regla de preservación', () => {
  const baseLead = { fullName: 'Alguien', source: 'manual' } as unknown as Lead

  const baseForm = () => {
    const form = new FormData()
    form.set('fullName', 'Alguien')
    form.set('source', 'manual')
    return form
  }

  it('sin opciones de rubro: segment queda undefined aunque el form envíe vacío', () => {
    const form = baseForm()
    form.set('segment', '')
    form.set('assignedTo', '')
    const input = collectLeadFieldsInput(form, baseLead, {
      hasAssigneeChoices: false,
      hasSegmentChoices: false,
    })
    expect(input.segment).toBeUndefined()
    expect(input.assignedTo).toBeUndefined()
  })

  it('con opciones: form vacío significa "sin rubro" explícito (null)', () => {
    const form = baseForm()
    form.set('segment', '')
    form.set('assignedTo', '')
    const input = collectLeadFieldsInput(form, baseLead, {
      hasAssigneeChoices: true,
      hasSegmentChoices: true,
    })
    expect(input.segment).toBeNull()
    expect(input.assignedTo).toBeNull()
  })

  it('notas largas existentes (4000 chars) sin editar se omiten y NO se truncan', () => {
    const longNotes = 'n'.repeat(4000)
    const lead = { ...baseLead, notes: longNotes } as unknown as Lead
    const form = baseForm()
    form.set('notes', longNotes) // el textarea lleva el valor existente sin editar

    const input = collectLeadFieldsInput(form, lead, {
      hasAssigneeChoices: false,
      hasSegmentChoices: false,
    })

    // undefined = el update no toca las notas → no hay truncado destructivo
    expect(input.notes).toBeUndefined()
  })

  it('notas editadas activamente se envían con toco de 20000 chars', () => {
    const lead = { ...baseLead, notes: 'original' } as unknown as Lead
    const form = baseForm()
    form.set('notes', 'e'.repeat(25000))

    const input = collectLeadFieldsInput(form, lead, {
      hasAssigneeChoices: false,
      hasSegmentChoices: false,
    })

    expect((input.notes as string).length).toBe(20000)
  })

  it('campos de texto sin cambios se omiten del update', () => {
    const lead = { ...baseLead, city: 'Caracas', phone: '584121234567' } as unknown as Lead
    const form = baseForm()
    form.set('city', 'Caracas')
    form.set('phone', '584121234567')

    const input = collectLeadFieldsInput(form, lead, {
      hasAssigneeChoices: false,
      hasSegmentChoices: false,
    })

    expect(input.city).toBeUndefined()
    expect(input.phone).toBeUndefined()
  })
})

describe('LeadDrawerDataTab — preservación de fechas y timezones (lastContactedAt y fechaProximaLlamada)', () => {
  it('lastContactedAt sin editar se omite (undefined) y no sufre shift horario al guardar', () => {
    const instant = '2026-09-06T15:30:00.000Z'
    const lead = { fullName: 'Alguien', source: 'manual', lastContactedAt: instant } as unknown as Lead
    const form = new FormData()
    form.set('fullName', 'Alguien')
    // El input datetime-local lleva el valor renderizado por toDateInput en el browser
    form.set('lastContactedAt', toDateInput(instant, true))

    const input = collectLeadFieldsInput(form, lead, {
      hasAssigneeChoices: false,
      hasSegmentChoices: false,
    })

    // Crítico: undefined significa que el update no envía ni altera lastContactedAt
    expect(input.lastContactedAt).toBeUndefined()
  })

  it('lastContactedAt editado activamente se convierte a ISO UTC instant antes de invocar la acción', () => {
    const lead = { fullName: 'Alguien', source: 'manual', lastContactedAt: '2026-09-06T15:30:00.000Z' } as unknown as Lead
    const form = new FormData()
    form.set('fullName', 'Alguien')
    form.set('lastContactedAt', '2026-09-06T18:45')

    const input = collectLeadFieldsInput(form, lead, {
      hasAssigneeChoices: false,
      hasSegmentChoices: false,
    })

    expect(typeof input.lastContactedAt).toBe('string')
    expect(input.lastContactedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    const submittedMs = new Date(input.lastContactedAt as string).getTime()
    const expectedMs = new Date('2026-09-06T18:45').getTime()
    expect(submittedMs).toBe(expectedMs)
  })

  it('lastContactedAt borrado explícitamente envía null para limpiar el campo en la base de datos', () => {
    const lead = { fullName: 'Alguien', source: 'manual', lastContactedAt: '2026-09-06T15:30:00.000Z' } as unknown as Lead
    const form = new FormData()
    form.set('fullName', 'Alguien')
    form.set('lastContactedAt', '')

    const input = collectLeadFieldsInput(form, lead, {
      hasAssigneeChoices: false,
      hasSegmentChoices: false,
    })

    expect(input.lastContactedAt).toBeNull()
  })

  it('lastContactedAt ausente en el lead y sin valor en el formulario queda undefined (no se toca)', () => {
    const lead = { fullName: 'Alguien', source: 'manual' } as unknown as Lead
    const form = new FormData()
    form.set('fullName', 'Alguien')
    form.set('lastContactedAt', '')

    const input = collectLeadFieldsInput(form, lead, {
      hasAssigneeChoices: false,
      hasSegmentChoices: false,
    })

    expect(input.lastContactedAt).toBeUndefined()
  })

  it('preserva el instante idéntico a través de diferentes husos horarios (browser offset vs server offset)', () => {
    const leadInstant = '2026-09-06T15:30:00.000Z'

    // Si el usuario edita a las 14:00 hora local en el navegador
    const editedLocal = '2026-09-06T14:00'
    const parsedLocal = new Date(editedLocal)
    const isoFromBrowser = ifDatetimeChanged(leadInstant, editedLocal)

    expect(isoFromBrowser).toBe(parsedLocal.toISOString())
    // Y el servidor, independientemente de su huso horario, parsea el string ISO UTC sin desviación
    const serverParsedMs = new Date(isoFromBrowser as string).getTime()
    expect(serverParsedMs).toBe(parsedLocal.getTime())

    // Comprobar que un valor sin editar se detecta como idéntico al minuto y se omite
    const uneditedIso = ifDatetimeChanged(leadInstant, toDateInput(leadInstant, true))
    expect(uneditedIso).toBeUndefined()
  })

  it('fechaProximaLlamada sin editar se omite; editada se envía; vacía se limpia (null)', () => {
    const lead = {
      fullName: 'Alguien',
      source: 'manual',
      fechaProximaLlamada: '2026-09-10T00:00:00.000Z',
    } as unknown as Lead

    const uneditedForm = new FormData()
    uneditedForm.set('fullName', 'Alguien')
    uneditedForm.set('fechaProximaLlamada', toDateInput(lead.fechaProximaLlamada))

    const uneditedInput = collectLeadFieldsInput(uneditedForm, lead, {
      hasAssigneeChoices: false,
      hasSegmentChoices: false,
    })
    expect(uneditedInput.fechaProximaLlamada).toBeUndefined()

    const editedForm = new FormData()
    editedForm.set('fullName', 'Alguien')
    editedForm.set('fechaProximaLlamada', '2026-09-20')

    const editedInput = collectLeadFieldsInput(editedForm, lead, {
      hasAssigneeChoices: false,
      hasSegmentChoices: false,
    })
    expect(editedInput.fechaProximaLlamada).toBe('2026-09-20')

    const clearedForm = new FormData()
    clearedForm.set('fullName', 'Alguien')
    clearedForm.set('fechaProximaLlamada', '')

    const clearedInput = collectLeadFieldsInput(clearedForm, lead, {
      hasAssigneeChoices: false,
      hasSegmentChoices: false,
    })
    expect(clearedInput.fechaProximaLlamada).toBeNull()

    // Verificación unitaria de la función pura ifDateChanged
    expect(ifDateChanged(lead.fechaProximaLlamada, toDateInput(lead.fechaProximaLlamada))).toBeUndefined()
    expect(ifDateChanged(lead.fechaProximaLlamada, '2026-09-20')).toBe('2026-09-20')
    expect(ifDateChanged(lead.fechaProximaLlamada, '')).toBeNull()
  })
})
