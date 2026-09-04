/**
 * Dinero de la app en USD **entero** (decisión de negocio: sin centavos).
 *
 * Los enteros se representan de forma exacta en float64 (hasta 2^53), así
 * que redondear a entero en el límite de escritura elimina el error binario
 * de los `SUM()` de Postgres sin migrar columnas ni cambiar de tipo.
 */

/** Normaliza cualquier entrada numérica a entero USD; null si no hay valor o no es finito. */
export function wholeUsd(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.round(n)
}

/** Valida un monto ya numérico como entero (para validar en campos Payload). */
export function isWholeUsd(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value)
}
