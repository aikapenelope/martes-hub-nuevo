import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import {
  DEFAULT_EXECUTIVE_WIDGETS,
  DEFAULT_OPERATIVE_WIDGETS,
  EXECUTIVE_WIDGET_KEYS,
  OPERATIVE_WIDGET_KEYS,
  STORAGE_KEY_OPERATIVE,
  isValidWidgetLayout,
  useWidgetLayout,
} from '@/components/workspace/overview/widget-layout'

describe('useWidgetLayout — restauración segura para hidratación', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('el PRIMER render usa los defaults aunque haya layout guardado (server == cliente)', () => {
    localStorage.setItem(
      STORAGE_KEY_OPERATIVE,
      JSON.stringify(DEFAULT_OPERATIVE_WIDGETS.map((w) => ({ ...w, visible: false }))),
    )

    // renderHook monta y ejecuta efectos dentro de act; para probar el primer
    // render usamos un renderer manual que capture el estado antes del effect.
    let firstValue: unknown = null
    function Probe(): null {
      const [widgets] = useWidgetLayout(
        STORAGE_KEY_OPERATIVE,
        DEFAULT_OPERATIVE_WIDGETS,
        OPERATIVE_WIDGET_KEYS,
      )
      if (firstValue === null) firstValue = widgets
      return null
    }

    const { rerender } = renderHook(() => Probe())
    rerender()

    expect(firstValue).toBe(DEFAULT_OPERATIVE_WIDGETS)
  })

  it('tras la hidratación restaura el layout guardado (con widgets ocultos)', async () => {
    const saved = DEFAULT_OPERATIVE_WIDGETS.map((w) => ({ ...w, visible: false }))
    localStorage.setItem(STORAGE_KEY_OPERATIVE, JSON.stringify(saved))

    const { result } = renderHook(() =>
      useWidgetLayout(STORAGE_KEY_OPERATIVE, DEFAULT_OPERATIVE_WIDGETS, OPERATIVE_WIDGET_KEYS),
    )

    await waitFor(() => {
      expect(result.current[0]).toEqual(saved)
    })
    expect(result.current[0].every((w) => w.visible === false)).toBe(true)
  })

  it('restaura también la vista ejecutiva con su propia clave', async () => {
    const saved = DEFAULT_EXECUTIVE_WIDGETS.map((w) => ({
      ...w,
      visible: w.key === 'kpis',
    }))
    localStorage.setItem('martes_cockpit_layout_executive_v1', JSON.stringify(saved))

    const { result } = renderHook(() =>
      useWidgetLayout(
        'martes_cockpit_layout_executive_v1',
        DEFAULT_EXECUTIVE_WIDGETS,
        EXECUTIVE_WIDGET_KEYS,
      ),
    )

    await waitFor(() => {
      expect(result.current[0]).toEqual(saved)
    })
  })

  it('ignora layouts corruptos (JSON inválido) y se queda con los defaults', async () => {
    localStorage.setItem(STORAGE_KEY_OPERATIVE, '{no-es-json')

    const { result } = renderHook(() =>
      useWidgetLayout(STORAGE_KEY_OPERATIVE, DEFAULT_OPERATIVE_WIDGETS, OPERATIVE_WIDGET_KEYS),
    )

    await new Promise((r) => setTimeout(r, 10))
    expect(result.current[0]).toBe(DEFAULT_OPERATIVE_WIDGETS)
  })

  it('ignora layouts con claves desconocidas (validación de esquema)', async () => {
    localStorage.setItem(
      STORAGE_KEY_OPERATIVE,
      JSON.stringify([{ key: 'widget-hackeado', label: 'X', visible: true }]),
    )

    const { result } = renderHook(() =>
      useWidgetLayout(STORAGE_KEY_OPERATIVE, DEFAULT_OPERATIVE_WIDGETS, OPERATIVE_WIDGET_KEYS),
    )

    await new Promise((r) => setTimeout(r, 10))
    expect(result.current[0]).toBe(DEFAULT_OPERATIVE_WIDGETS)
  })

  it('isValidWidgetLayout rechaza entradas sin visible booleano', () => {
    expect(
      isValidWidgetLayout([{ key: 'alerts', label: 'X', visible: 'yes' }], OPERATIVE_WIDGET_KEYS),
    ).toBe(false)
    expect(isValidWidgetLayout([], OPERATIVE_WIDGET_KEYS)).toBe(false)
    expect(
      isValidWidgetLayout([{ key: 'alerts', label: 'X', visible: true }], OPERATIVE_WIDGET_KEYS),
    ).toBe(true)
  })
})
