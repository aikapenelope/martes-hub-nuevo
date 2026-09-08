import type { CollectionBeforeOperationHook } from 'payload'

/**
 * Payload #13309: la detección de tipo de archivos (file-type vía
 * checkFileRestrictions) lanza "Could not read uploaded file for type
 * detection" cuando el upload llega por Local API con un Buffer — exige un
 * Uint8Array "puro". Los plugins suben así sus archivos (payload-invoicepdf:
 * PDFs de facturas/cotizaciones), y los beforeOperation corren ANTES de
 * generateFileData en el orden de operaciones de Payload, de modo que
 * normalizar aquí es suficiente.
 *
 * Colecciones con upload: media y documents.
 */
export const normalizeUploadBuffer: CollectionBeforeOperationHook = async ({ req }) => {
  const file = req.file as { data?: unknown } | undefined
  const data = file?.data
  if (!file || data === undefined || data === null) return

  // Un Buffer del mismo realm ya pasa instanceof Uint8Array en file-type; el
  // fallo ocurre con Buffers que llegan por otra vía de carga (el #13309
  // reporta "got object"). new Uint8Array(buffer) produce una copia limpia y
  // determinista que file-type acepta siempre.
  const looksValid = data instanceof Uint8Array && data.constructor === Uint8Array
  if (!looksValid) {
    try {
      file.data = new Uint8Array(data as Buffer)
    } catch {
      // Si no es convertible, el pipeline de upload reporta su propio error.
    }
  }
}
