/**
 * Escapa un string para interpolación segura en HTML (emails, principalmente).
 * Sin esto, un nombre de cliente/lead con `<script>` o similar se interpola
 * crudo en el HTML del email — inyección HTML en el cliente de correo del
 * destinatario.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
