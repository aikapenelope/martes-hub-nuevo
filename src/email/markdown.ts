/**
 * Conversión segura de texto plano/Markdown a HTML de email.
 *
 * Primero se escapa TODO el HTML de la entrada — el cuerpo del mensaje nunca
 * puede inyectar markup propio (scripts, tracking, identidad engañosa) — y
 * solo después se aplican las transformaciones Markdown, así que las únicas
 * etiquetas del resultado son las generadas aquí y los href quedan limitados
 * a http(s)/mailto.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch)
}

function safeHref(url: string): string | null {
  return /^(https?:\/\/|mailto:)\S+$/i.test(url) ? url : null
}

/** Inline sobre texto YA escapado: code, enlaces, negrita y cursiva. */
function renderInline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, text: string, url: string) => {
      const href = safeHref(url)
      return href ? `<a href="${href}">${text}</a>` : text
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
}

/**
 * Markdown mínimo para emails: párrafos (línea en blanco separa, salto
 * simple → <br>), viñetas `-`/`*`, títulos `#`/`##`/`###`, `**negrita**`,
 * `*cursiva*`, `` `código` `` y enlaces `[texto](https://…)` — siempre
 * escapado, sin HTML literal del usuario.
 */
export function renderMarkdownToSafeHtml(body: string): string {
  const blocks = body.replace(/\r\n/g, '\n').split(/\n{2,}/)
  const html: string[] = []

  for (const rawBlock of blocks) {
    const block = rawBlock.trim()
    if (!block) continue
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)

    if (lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line))) {
      const items = lines
        .map((line) => `<li>${renderInline(escapeHtml(line.replace(/^[-*]\s+/, '')))}</li>`)
        .join('')
      html.push(`<ul>${items}</ul>`)
      continue
    }

    if (lines.length === 1) {
      const heading = lines[0].match(/^#{1,3}\s+(.+)$/)
      if (heading) {
        html.push(`<p><strong>${renderInline(escapeHtml(heading[1]))}</strong></p>`)
        continue
      }
    }

    html.push(`<p>${lines.map((line) => renderInline(escapeHtml(line))).join('<br />')}</p>`)
  }

  return html.join('')
}
