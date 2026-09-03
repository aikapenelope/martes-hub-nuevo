import { useCallback, useSyncExternalStore } from 'react'

export type OperativeWidgetKey = 'alerts' | 'health' | 'followups' | 'agenda' | 'feed'
export type ExecutiveWidgetKey = 'kpis' | 'cashflow' | 'funnel' | 'heatmap' | 'sources' | 'priorities'

export interface WidgetConfig<T extends string> {
  key: T
  label: string
  visible: boolean
}

export const DEFAULT_OPERATIVE_WIDGETS: WidgetConfig<OperativeWidgetKey>[] = [
  { key: 'alerts', label: 'Alertas Operativas Proactivas', visible: true },
  { key: 'health', label: 'Monitor de Salud de Canales e Integraciones', visible: true },
  { key: 'followups', label: 'Seguimientos Proactivos de Hoy (SLA)', visible: true },
  { key: 'agenda', label: 'Agenda de Próximos 7 Días', visible: true },
  { key: 'feed', label: 'Feed Omnicanal en Vivo', visible: true },
]

export const DEFAULT_EXECUTIVE_WIDGETS: WidgetConfig<ExecutiveWidgetKey>[] = [
  { key: 'kpis', label: 'Tarjetas KPI de Rendimiento', visible: true },
  { key: 'cashflow', label: 'Flujo de Caja (6 Meses)', visible: true },
  { key: 'funnel', label: 'Embudo de Conversión Real', visible: true },
  { key: 'heatmap', label: 'Matriz Anual de Actividad (364 Días)', visible: true },
  { key: 'sources', label: 'Canales de Captación', visible: true },
  { key: 'priorities', label: 'Radar de Prioridades Comerciales', visible: true },
]

export const OPERATIVE_WIDGET_KEYS: readonly OperativeWidgetKey[] = DEFAULT_OPERATIVE_WIDGETS.map(
  (w) => w.key,
)
export const EXECUTIVE_WIDGET_KEYS: readonly ExecutiveWidgetKey[] = DEFAULT_EXECUTIVE_WIDGETS.map(
  (w) => w.key,
)

export const STORAGE_KEY_OPERATIVE = 'martes_cockpit_layout_operative_v1'
export const STORAGE_KEY_EXECUTIVE = 'martes_cockpit_layout_executive_v1'

/**
 * Valida un layout persistido: cada entrada debe tener una clave conocida,
 * label string y visible booleano. Un layout corrupto o con claves viejas
 * cae al default en lugar de romper el dashboard.
 */
export function isValidWidgetLayout<K extends string>(
  parsed: unknown,
  validKeys: readonly K[],
): parsed is WidgetConfig<K>[] {
  return (
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every(
      (w) =>
        typeof w === 'object' &&
        w !== null &&
        typeof (w as WidgetConfig<K>).key === 'string' &&
        validKeys.includes((w as WidgetConfig<K>).key) &&
        typeof (w as WidgetConfig<K>).visible === 'boolean',
    )
  )
}

function readStoredWidgetLayout<K extends string>(
  storageKey: string,
  validKeys: readonly K[],
): WidgetConfig<K>[] | null {
  try {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return null
    const parsed: unknown = JSON.parse(saved)
    if (isValidWidgetLayout(parsed, validKeys)) return parsed
  } catch {
    // JSON corrupto → default
  }
  return null
}

/**
 * Casca la visibilidad guardada (por clave) sobre los defaults actuales: un
 * layout persistido incompleto (viejo o truncado) no pierde widgets — los
 * faltantes heredan su entrada del default y siguen configurables, y los
 * nuevos widgets que lleguen en el futuro aparecen solos.
 */
function normalizeWidgetLayout<K extends string>(
  stored: WidgetConfig<K>[],
  defaults: WidgetConfig<K>[],
): WidgetConfig<K>[] {
  return defaults.map((d) => {
    const found = stored.find((w) => w.key === d.key)
    return found ? { ...d, visible: found.visible } : d
  })
}

// Suscriptores del store de layouts (cross-tab vía evento 'storage' y
// misma-pestaña vía notifyLayoutChange al persistir).
const listeners = new Set<(event?: StorageEvent) => void>()
function subscribe(onStoreChange: (event?: StorageEvent) => void): () => void {
  const onStorage = (event: StorageEvent) => {
    // Un write exitoso en otra pestaña invalida el modo memory-only local
    if (event.key === null) {
      for (const entry of snapshotCache.values()) entry.memoryOnly = false
    } else {
      const entry = snapshotCache.get(event.key)
      if (entry) entry.memoryOnly = false
    }
    onStoreChange(event)
  }
  listeners.add(onStoreChange)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onStoreChange)
    window.removeEventListener('storage', onStorage)
  }
}
function notifyLayoutChange(): void {
  for (const listener of listeners) listener()
}

// Cache por clave: getSnapshot debe devolver identidad estable mientras el
// contenido crudo de localStorage no cambie (React compara con Object.is).
// `memoryOnly` marca una clave cuyo último write a localStorage falló
// (storage bloqueado/lleno): el valor en memoria pasa a ser la fuente
// autoritativa hasta que un evento 'storage' de otra pestaña lo sincronice.
const snapshotCache = new Map<
  string,
  { raw: string | null; value: unknown; memoryOnly?: boolean }
>()

function getLayoutSnapshot<K extends string>(
  storageKey: string,
  validKeys: readonly K[],
  defaults: WidgetConfig<K>[],
): WidgetConfig<K>[] {
  const cached = snapshotCache.get(storageKey)
  if (cached?.memoryOnly) return cached.value as WidgetConfig<K>[]
  let raw: string | null = null
  try {
    raw = localStorage.getItem(storageKey)
  } catch {
    return defaults
  }
  if (cached && cached.raw === raw) return cached.value as WidgetConfig<K>[]
  const stored = readStoredWidgetLayout(storageKey, validKeys)
  const value = stored ? normalizeWidgetLayout(stored, defaults) : defaults
  snapshotCache.set(storageKey, { raw, value })
  return value
}

/**
 * Layout del Bento personalizable, persistido en localStorage.
 *
 * Crítico para la hidratación: es un store externo leído con
 * useSyncExternalStore. Durante el render del servidor Y la hidratación React
 * usa getServerSnapshot (los defaults), y solo después de hidratar lee el
 * snapshot real del cliente — así servidor y primer render del cliente
 * producen el mismo árbol aunque el usuario tenga widgets ocultos guardados.
 * Leer localStorage en un useState initializer (o setState en effect) rompe
 * ese contrato.
 */
export function useWidgetLayout<K extends string>(
  storageKey: string,
  defaults: WidgetConfig<K>[],
  validKeys: readonly K[],
): [
  WidgetConfig<K>[],
  (next: WidgetConfig<K>[] | ((prev: WidgetConfig<K>[]) => WidgetConfig<K>[])) => void,
] {
  const getSnapshot = useCallback(
    () => getLayoutSnapshot(storageKey, validKeys, defaults),
    [storageKey, validKeys, defaults],
  )
  const getServerSnapshot = useCallback(() => defaults, [defaults])

  const widgets = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setWidgets = useCallback(
    (next: WidgetConfig<K>[] | ((prev: WidgetConfig<K>[]) => WidgetConfig<K>[])) => {
      const current = getLayoutSnapshot(storageKey, validKeys, defaults)
      const resolved = typeof next === 'function' ? next(current) : next
      try {
        localStorage.setItem(storageKey, JSON.stringify(resolved))
        // Write exitoso: storage vuelve a ser la fuente autoritativa
        snapshotCache.set(storageKey, { raw: JSON.stringify(resolved), value: resolved })
      } catch {
        // Storage bloqueado o lleno: el layout vive en memoria (memory-only)
        // para que los toggles sigan funcionando durante la sesión
        snapshotCache.set(storageKey, { raw: null, value: resolved, memoryOnly: true })
      }
      notifyLayoutChange()
    },
    [storageKey, validKeys, defaults],
  )

  return [widgets, setWidgets]
}
