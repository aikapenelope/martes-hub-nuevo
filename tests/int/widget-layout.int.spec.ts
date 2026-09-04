import { createElement } from 'react'
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { renderHook, waitFor, act } from '@testing-library/react'
import {
  DEFAULT_OPERATIVE_WIDGETS,
  OPERATIVE_WIDGET_KEYS,
  STORAGE_KEY_OPERATIVE,
  isValidWidgetLayout,
  useWidgetLayout,
  getWidgetSpanClass,
  cycleWidgetSpan,
} from '@/components/workspace/overview/widget-layout'
import type { WidgetConfig } from '@/components/workspace/overview/widget-layout'

function Probe(props: {
  storageKey: string
  defaults: WidgetConfig<'alerts'>[]
  keys: readonly ('alerts')[]
}) {
  const [widgets] = useWidgetLayout(props.storageKey, props.defaults, props.keys)
  return createElement('div', {
    'data-layout': widgets.map((w) => `${w.key}:${w.visible}`).join(','),
  })
}

describe('useWidgetLayout — layout persistido seguro para hidratación', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    // Limpia la cache global del módulo (entradas memory-only) simulando el
    // evento de storage que las invalida, y vacía localStorage.
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY_OPERATIVE }))
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'martes_cockpit_layout_executive_v1' }),
    )
    localStorage.clear()
  })

  it('SSR renderiza los DEFAULTS aunque haya un layout con widgets ocultos guardado', () => {
    const saved = DEFAULT_OPERATIVE_WIDGETS.map((w) => ({ ...w, visible: false }))
    localStorage.setItem(STORAGE_KEY_OPERATIVE, JSON.stringify(saved))

    const html = renderToString(
      createElement(Probe, {
        storageKey: STORAGE_KEY_OPERATIVE,
        defaults: DEFAULT_OPERATIVE_WIDGETS as unknown as WidgetConfig<'alerts'>[],
        keys: OPERATIVE_WIDGET_KEYS as readonly 'alerts'[],
      }),
    )

    // El snapshot de servidor es siempre el default → mismo árbol que el
    // primer render de hidratación del cliente.
    expect(html).toContain('alerts:true')
    expect(html).not.toContain('alerts:false')
  })

  it('el cliente restaura el layout guardado tras hidratar (con widgets ocultos)', async () => {
    const saved = DEFAULT_OPERATIVE_WIDGETS.map((w) => ({ ...w, visible: false }))
    localStorage.setItem(STORAGE_KEY_OPERATIVE, JSON.stringify(saved))

    const { result } = renderHook(() =>
      useWidgetLayout(
        STORAGE_KEY_OPERATIVE,
        DEFAULT_OPERATIVE_WIDGETS as unknown as WidgetConfig<'alerts'>[],
        OPERATIVE_WIDGET_KEYS as readonly 'alerts'[],
      ),
    )

    await waitFor(() => {
      expect(result.current[0].every((w) => w.visible === false)).toBe(true)
    })
  })

  it('sin layout guardado devuelve los defaults', () => {
    const { result } = renderHook(() =>
      useWidgetLayout(
        STORAGE_KEY_OPERATIVE,
        DEFAULT_OPERATIVE_WIDGETS as unknown as WidgetConfig<'alerts'>[],
        OPERATIVE_WIDGET_KEYS as readonly 'alerts'[],
      ),
    )
    expect(result.current[0]).toBe(DEFAULT_OPERATIVE_WIDGETS)
  })

  it('setWidgets persiste en localStorage y notifica al store', async () => {
    const { result } = renderHook(() =>
      useWidgetLayout(
        STORAGE_KEY_OPERATIVE,
        DEFAULT_OPERATIVE_WIDGETS as unknown as WidgetConfig<'alerts'>[],
        OPERATIVE_WIDGET_KEYS as readonly 'alerts'[],
      ),
    )

    act(() => {
      result.current[1]((prev) => prev.map((w) => ({ ...w, visible: false })))
    })

    expect(result.current[0].every((w) => w.visible === false)).toBe(true)
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY_OPERATIVE) ?? '[]') as Array<{
      key: string
      visible: boolean
    }>
    expect(raw.every((w) => w.visible === false)).toBe(true)
  })

  it('con localStorage bloqueado, los toggles siguen funcionando en memoria', () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

    try {
      const { result } = renderHook(() =>
        useWidgetLayout(
          STORAGE_KEY_OPERATIVE,
          DEFAULT_OPERATIVE_WIDGETS as unknown as WidgetConfig<'alerts'>[],
          OPERATIVE_WIDGET_KEYS as readonly 'alerts'[],
        ),
      )

      act(() => {
        result.current[1]((prev) => prev.map((w) => ({ ...w, visible: false })))
      })

      // El snapshot de memoria manda: el toggle tiene efecto aunque storage falle
      expect(result.current[0].every((w) => w.visible === false)).toBe(true)
      expect(localStorage.getItem(STORAGE_KEY_OPERATIVE)).toBeNull()
    } finally {
      setItemSpy.mockRestore()
    }
  })

  it('ignora layouts corruptos (JSON inválido) y se queda con los defaults', () => {
    localStorage.setItem(STORAGE_KEY_OPERATIVE, '{no-es-json')

    const { result } = renderHook(() =>
      useWidgetLayout(
        STORAGE_KEY_OPERATIVE,
        DEFAULT_OPERATIVE_WIDGETS as unknown as WidgetConfig<'alerts'>[],
        OPERATIVE_WIDGET_KEYS as readonly 'alerts'[],
      ),
    )
    expect(result.current[0]).toBe(DEFAULT_OPERATIVE_WIDGETS)
  })

  it('ignora layouts con claves desconocidas (validación de esquema)', () => {
    localStorage.setItem(
      STORAGE_KEY_OPERATIVE,
      JSON.stringify([{ key: 'widget-hackeado', label: 'X', visible: true }]),
    )

    const { result } = renderHook(() =>
      useWidgetLayout(
        STORAGE_KEY_OPERATIVE,
        DEFAULT_OPERATIVE_WIDGETS as unknown as WidgetConfig<'alerts'>[],
        OPERATIVE_WIDGET_KEYS as readonly 'alerts'[],
      ),
    )
    expect(result.current[0]).toBe(DEFAULT_OPERATIVE_WIDGETS)
  })

  it('normaliza layouts incompletos: los widgets faltantes vuelven del default', () => {
    // Layout viejo/truncado: solo 2 de los 5 widgets operativos
    localStorage.setItem(
      STORAGE_KEY_OPERATIVE,
      JSON.stringify([
        { key: 'alerts', label: 'Alertas Operativas Proactivas', visible: false },
        { key: 'agenda', label: 'Agenda de Próximos 7 Días', visible: true },
      ]),
    )

    const { result } = renderHook(() =>
      useWidgetLayout(
        STORAGE_KEY_OPERATIVE,
        DEFAULT_OPERATIVE_WIDGETS as unknown as WidgetConfig<'alerts'>[],
        OPERATIVE_WIDGET_KEYS as readonly 'alerts'[],
      ),
    )

    const widgets = result.current[0] as unknown as Array<{ key: string; visible: boolean }>
    // Todos los widgets del default están presentes (configurables)
    expect(widgets.map((w) => w.key)).toEqual(DEFAULT_OPERATIVE_WIDGETS.map((w) => w.key))
    // La visibilidad guardada se respeta donde existía
    expect(widgets.find((w) => w.key === 'alerts')?.visible).toBe(false)
    expect(widgets.find((w) => w.key === 'agenda')?.visible).toBe(true)
    // Los faltantes heredan el default (visibles)
    expect(widgets.find((w) => w.key === 'health')?.visible).toBe(true)
    expect(widgets.find((w) => w.key === 'feed')?.visible).toBe(true)
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

  it('getWidgetSpanClass mapea spans a clases de Tailwind Grid correspondientes', () => {
    expect(getWidgetSpanClass('compact')).toBe('lg:col-span-4 md:col-span-1 col-span-1')
    expect(getWidgetSpanClass('normal')).toBe('lg:col-span-6 md:col-span-1 col-span-1')
    expect(getWidgetSpanClass('wide')).toBe('lg:col-span-8 md:col-span-2 col-span-1')
    expect(getWidgetSpanClass('full')).toBe('lg:col-span-12 md:col-span-2 col-span-1')
    expect(getWidgetSpanClass(undefined)).toBe('lg:col-span-6 md:col-span-1 col-span-1')
  })

  it('cycleWidgetSpan cicla correctamente de compacto a completo y reinicia', () => {
    expect(cycleWidgetSpan('compact')).toBe('normal')
    expect(cycleWidgetSpan('normal')).toBe('wide')
    expect(cycleWidgetSpan('wide')).toBe('full')
    expect(cycleWidgetSpan('full')).toBe('compact')
    expect(cycleWidgetSpan(undefined)).toBe('compact')
  })

  it('persiste y restaura span y orden personalizado del widget layout', async () => {
    const customized: WidgetConfig<'alerts'>[] = [
      { key: 'alerts', label: 'Alertas', visible: true, span: 'compact', order: 2 },
    ]
    localStorage.setItem(STORAGE_KEY_OPERATIVE, JSON.stringify(customized))

    const { result } = renderHook(() =>
      useWidgetLayout(
        STORAGE_KEY_OPERATIVE,
        DEFAULT_OPERATIVE_WIDGETS as unknown as WidgetConfig<'alerts'>[],
        OPERATIVE_WIDGET_KEYS as readonly 'alerts'[],
      ),
    )

    await waitFor(() => {
      const alerts = result.current[0].find((w) => w.key === 'alerts')
      expect(alerts?.span).toBe('compact')
      expect(alerts?.order).toBe(2)
    })
  })
})
