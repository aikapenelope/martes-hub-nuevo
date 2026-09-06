/**
 * Utilidades puras para notas y árboles Lexical.
 * Este archivo NO lleva 'use server' para poder ser importado tanto por
 * Client Components ('use client') como por Server Actions sin violar
 * las restricciones de empaquetado de Next.js.
 */

/**
 * Extrae texto legible a partir de la estructura jerárquica de Lexical
 * respetando saltos de línea entre párrafos y elementos de lista.
 */
export function extractPlainTextFromLexical(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as Record<string, unknown>
  if (typeof n.text === 'string') return n.text
  if (Array.isArray(n.children)) {
    const pieces = n.children.map(extractPlainTextFromLexical)
    if (n.type === 'paragraph' || n.type === 'heading' || n.type === 'listitem') {
      return pieces.join('') + '\n'
    }
    return pieces.join('')
  }
  if (n.root && typeof n.root === 'object') {
    return extractPlainTextFromLexical(n.root).trim()
  }
  return ''
}

/**
 * Detecta si un documento Lexical contiene nodos avanzados que un textarea
 * plano no puede representar (enlaces, encabezados, citas, tablas, etc.)
 */
export function hasComplexLexicalNodes(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false
  const n = node as Record<string, unknown>

  const complexTypes = new Set([
    'heading',
    'link',
    'autolink',
    'quote',
    'table',
    'tablerow',
    'tablecell',
    'upload',
    'code',
    'horizontalrule',
  ])

  if (typeof n.type === 'string' && complexTypes.has(n.type.toLowerCase())) {
    return true
  }

  if (Array.isArray(n.children)) {
    return n.children.some(hasComplexLexicalNodes)
  }

  if (n.root && typeof n.root === 'object') {
    return hasComplexLexicalNodes(n.root)
  }

  return false
}
