export const LEAD_STATUSES = ['nuevo', 'contactado', 'calificado', 'descartado'] as const
export const CLIENT_STAGES = ['nuevo', 'activo', 'inactivo', 'perdido'] as const
export const LEAD_SOURCES = [
  'manual',
  'google_maps',
  'puerta_fria',
  'whatsapp',
  'instagram_dm',
  'linkedin',
  'tally',
  'apify',
  'referido',
] as const
export const CRM_VIEWS = ['leads', 'clientes', 'empresas'] as const
export const CRM_MODES = ['pipeline', 'tabla'] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]
export type ClientStage = (typeof CLIENT_STAGES)[number]
export type LeadSource = (typeof LEAD_SOURCES)[number]
export type CrmView = (typeof CRM_VIEWS)[number]
/** Solo aplica a la vista `leads`: `clientes` y `empresas` siempre se muestran en tabla. */
export type CrmMode = (typeof CRM_MODES)[number]

const MAX_PAGE = 500
const MAX_QUERY_LENGTH = 120

export interface CrmSearchParams {
  vista?: string | string[]
  modo?: string | string[]
  q?: string | string[]
  estado?: string | string[]
  fuente?: string | string[]
  page?: string | string[]
}

export interface CrmFilters {
  view: CrmView
  mode: CrmMode
  query: string
  status: LeadStatus | 'todos'
  stage: ClientStage | 'todos'
  source?: LeadSource
  page: number
}

function firstValue(value?: string | string[]): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

/** Normaliza los filtros URL contra listas blancas y límites estrictos. */
export function parseCrmFilters(params: CrmSearchParams): CrmFilters {
  const rawView = firstValue(params.vista)
  const view: CrmView = CRM_VIEWS.includes(rawView as CrmView) ? (rawView as CrmView) : 'leads'
  const rawMode = firstValue(params.modo)
  const mode: CrmMode = CRM_MODES.includes(rawMode as CrmMode) ? (rawMode as CrmMode) : 'pipeline'
  const query = (firstValue(params.q) ?? '').trim().slice(0, MAX_QUERY_LENGTH)
  const rawStatus = firstValue(params.estado)
  const status: LeadStatus | 'todos' =
    view === 'leads' && LEAD_STATUSES.includes(rawStatus as LeadStatus) ? (rawStatus as LeadStatus) : 'todos'
  const stage: ClientStage | 'todos' =
    view === 'clientes' && CLIENT_STAGES.includes(rawStatus as ClientStage) ? (rawStatus as ClientStage) : 'todos'
  const rawSource = firstValue(params.fuente)
  const source: LeadSource | undefined =
    rawSource && LEAD_SOURCES.includes(rawSource as LeadSource) ? (rawSource as LeadSource) : undefined
  const parsedPage = Number.parseInt(firstValue(params.page) ?? '1', 10)
  const page = Number.isFinite(parsedPage) ? Math.min(Math.max(parsedPage, 1), MAX_PAGE) : 1
  return { view, mode, query, status, stage, source, page }
}
