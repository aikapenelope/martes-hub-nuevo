/**
 * Dinero de la app en USD **entero** (decisión de negocio: sin centavos).
 *
 * Los enteros se representan de forma exacta en float64 (hasta 2^53), así
 * que redondear a entero en el límite de escritura elimina el error binario
 * de los `SUM()` de Postgres sin migrar columnas ni cambiar de tipo.
 */

/** Normaliza cualquier entrada numérica a entero USD; null si no hay valor, no es finito o excede el rango exacto de float64. */
export function wholeUsd(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n)
  // Beyond 2^53 los enteros dejan de ser exactos en float64: rechazar en vez
  // de persistir un valor silenciosamente distinto al que envió el usuario.
  return Number.isSafeInteger(rounded) ? rounded : null
}

/** Valida un monto ya numérico como entero exacto (para validar en campos Payload). */
export function isWholeUsd(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value)
}
