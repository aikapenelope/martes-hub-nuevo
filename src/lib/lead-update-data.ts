/**
 * buildLeadUpdateData — mapeo puro del formulario del drawer al `data` de
 * payload.update. Extraído de updateLeadFieldsAction para poder testear la
 * semántica de las relaciones sin base de datos.
 *
 * Contrato de los campos de relación (segment / assignedTo / estimatedValue):
 * - `undefined` = "no actualizar" (el campo se omite del data y Payload no
 *   toca la relación existente). Es lo que envía el drawer cuando no hay
 *   opciones para elegir.
 * - `null` = "limpiar la relación" (elección explícita del usuario en
 *   "Sin rubro" / "Sin asignar").
 */

export interface LeadFieldsInput {
  fullName: string
  companyName?: string
  position?: string
  phone?: string
  email?: string
  city?: string
  state?: string
  address?: string
  googleMapsUrl?: string
  socialHandle?: string
  source?:
    | 'manual'
    | 'google_maps'
    | 'puerta_fria'
    | 'whatsapp'
    | 'instagram_dm'
    | 'linkedin'
    | 'tally'
    | 'apify'
    | 'referido'
  segment?: number | null
  estimatedValue?: number | null
  assignedTo?: number | null
  lastContactChannel?: 'whatsapp' | 'instagram_dm' | 'llamada' | 'en_persona' | 'email' | 'otro'
  commercialNotes?: string
  notes?: string
}

/** null atraviesa (limpia); undefined se omite (no toca el valor guardado). */
function relationshipField(
  value: number | null | undefined,
): number | null | undefined {
  return value === undefined ? undefined : value
}

/** Recorta y limpia texto acotado: las server actions no deben poder crear registros gigantes. */
function cap(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

// Límites por campo alineados con el tamaño real de la UI (textarea/input).
const LIMITS = {
  companyName: 200,
  position: 120,
  phone: 40,
  email: 320,
  city: 120,
  state: 120,
  address: 300,
  googleMapsUrl: 500,
  socialHandle: 120,
  commercialNotes: 20000,
  notes: 20000,
} as const

export function buildLeadUpdateData(input: LeadFieldsInput): Record<string, unknown> {
  const fullName = input.fullName.trim().slice(0, 160)
  return {
    fullName,
    companyName: cap(input.companyName, LIMITS.companyName),
    position: cap(input.position, LIMITS.position),
    phone: cap(input.phone, LIMITS.phone),
    email: cap(input.email, LIMITS.email),
    city: cap(input.city, LIMITS.city),
    state: cap(input.state, LIMITS.state),
    address: cap(input.address, LIMITS.address),
    googleMapsUrl: cap(input.googleMapsUrl, LIMITS.googleMapsUrl),
    socialHandle: cap(input.socialHandle, LIMITS.socialHandle),
    source: input.source || undefined,
    segment: relationshipField(input.segment),
    estimatedValue: relationshipField(input.estimatedValue),
    assignedTo: relationshipField(input.assignedTo),
    lastContactChannel: input.lastContactChannel || undefined,
    commercialNotes: cap(input.commercialNotes, LIMITS.commercialNotes),
    notes: cap(input.notes, LIMITS.notes),
  }
}
