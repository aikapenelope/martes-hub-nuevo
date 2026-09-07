/**
 * Sanitización server-side del HTML de campañas contra XSS: elimina scripts,
 * iframes, event handlers inline y URIs javascript:. Misma regla para el
 * guardado de campañas, la vista previa y el envío de prueba.
 */
export function sanitizeCampaignHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/\s*on\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\s*on\w+\s*=\s*[^>\s]+/gi, '')
    .replace(/javascript:/gi, '')
}
