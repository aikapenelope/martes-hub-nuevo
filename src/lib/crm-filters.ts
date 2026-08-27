export const LEAD_STATUSES = ['nuevo', 'contactado', 'calificado', 'descartado'] as const
export const CLIENT_STAGES = ['nuevo', 'activo', 'inactivo', 'perdido'] as const
export const CRM_VIEWS = ['leads', 'clientes'] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]
export type ClientStage = (typeof CLIENT_STAGES)[number]
export type CrmView = (typeof CRM_VIEWS)[number]

const MAX_PAGE = 500
const MAX_QUERY_LENGTH = 120

export interface CrmSearchParams {
  vista?: string | string[]
  q?: string | string[]
  estado?: string | string[]
  page?: string | string[]
}

export interface CrmFilters {
  view: CrmView
  query: string
  status: LeadStatus | 'todos'
  stage: ClientStage | 'todos'
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
  const query = (firstValue(params.q) ?? '').trim().slice(0, MAX_QUERY_LENGTH)
  const rawStatus = firstValue(params.estado)
  const status: LeadStatus | 'todos' =
    view === 'leads' && LEAD_STATUSES.includes(rawStatus as LeadStatus) ? (rawStatus as LeadStatus) : 'todos'
  const stage: ClientStage | 'todos' =
    view === 'clientes' && CLIENT_STAGES.includes(rawStatus as ClientStage) ? (rawStatus as ClientStage) : 'todos'
  const parsedPage = Number.parseInt(firstValue(params.page) ?? '1', 10)
  const page = Number.isFinite(parsedPage) ? Math.min(Math.max(parsedPage, 1), MAX_PAGE) : 1
  return { view, query, status, stage, page }
}
