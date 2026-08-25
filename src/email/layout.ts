interface EmailContent {
  title: string
  bodyHtml: string
  preheader?: string
  brandName?: string
  footer?: string
}

export function renderEmailHtml({
  title,
  bodyHtml,
  preheader,
  brandName = 'Martes',
  footer,
}: EmailContent): string {
  const safeTitle = escapeHtml(title)
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    ${preheader ? `<span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</span>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7;">
            <tr>
              <td style="padding:24px 32px;border-bottom:1px solid #e4e4e7;font-size:18px;font-weight:700;">${escapeHtml(brandName)}</td>
            </tr>
            <tr>
              <td style="padding:32px;font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid #e4e4e7;color:#a1a1aa;font-size:12px;">
                ${escapeHtml(footer ?? `${brandName} · Si no querés recibir estos emails, respondé con la palabra BAJA.`)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
