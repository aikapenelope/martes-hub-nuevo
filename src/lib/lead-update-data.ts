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

export function buildLeadUpdateData(input: LeadFieldsInput): Record<string, unknown> {
  const fullName = input.fullName.trim().slice(0, 160)
  return {
    fullName,
    companyName: input.companyName?.trim() || undefined,
    position: input.position?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    city: input.city?.trim() || undefined,
    state: input.state?.trim() || undefined,
    address: input.address?.trim() || undefined,
    googleMapsUrl: input.googleMapsUrl?.trim() || undefined,
    socialHandle: input.socialHandle?.trim() || undefined,
    source: input.source || undefined,
    segment: relationshipField(input.segment),
    estimatedValue: relationshipField(input.estimatedValue),
    assignedTo: relationshipField(input.assignedTo),
    lastContactChannel: input.lastContactChannel || undefined,
    commercialNotes: input.commercialNotes?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
  }
}
