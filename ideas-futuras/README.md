# Ideas futuras

Documentos de diseño (no implementación), priorizados en la revisión del
2026-09-09. Cada documento incluye el flujo completo, el modelo de datos, las
prácticas de Payload que aplican, **consideraciones de construcción ancladas
al estado real del repo** y un checklist para ejecutar el sprint.

| # | Idea | Resumen |
|---|------|---------|
| 04 | [Renovación de membresías en 1 clic](./04-renovacion-membresias-1-clic.md) | Botón "Renovar" → cobro pendiente nace solo, `renewalDate` se adelanta, el sistema de pagos existente hace el resto. **Sin auto-renew — se quedó en renovación manual de 1 clic** (fase 2 descartada). Tamaño S, patrón probado (`convertQuoteToInvoiceAction`). |
| 01 | [Social Hub: publicar directo, media temporal y espejo de Insights](./01-metricas-instagram-sin-media.md) | **v3 — decisión cambiada.** Composer tipo Metricool: imagen + caption → directo a Instagram vía Composio (managed OAuth, sin App Review). La imagen es **temporal (se borra a 48h)**, queda solo una miniatura en el historial. Métricas como espejo de Instagram Insights, job diario idempotente. |
| 03 | [Inteligencia de conversaciones](./03-inteligencia-conversaciones.md) | Página propia `/workspace/conversaciones` (sidebar, no tab del CRM) que concentra sentimiento, necesidades, antigüedad y temperatura por cliente/lead, con reactivación por IA y deep link `wa.me`. ~60% del motor ya existe repartido en 5 sitios. |
| 02 | [Conciliación de pagos desde WhatsApp](./02-conciliacion-pagos-whatsapp.md) | Captura de comprobante entrante → extracción con modelo de visión → `payments` en `por_confirmar` → botón único de confirmación en Billing. La imagen no se duplica: se referencia al mensaje. Doc pendiente de actualizar con sección de Consideraciones (como los demás) cuando llegue su turno. |
| 05 | [Conversiones y próximas acciones](./05-conversiones-y-proximas-acciones.md) | **Investigación — por decidir modelo.** Página de conversiones (modelos PostHog funnels vs HubSpot attribution, con links) + tarjetas de próxima acción con IA (estilo Einstein Next Best Action / HubSpot Prospecting Agent): a quién contactar, por qué ahora y qué escribirle. |

## Estado

Priorizado. Orden de construcción acordado:

**04 → 01 → 03 → 02** · (05 entra cuando se elija su modelo)

1. **04 Renovación 1-clic** — lo más corto, cierra el círculo del dinero.
2. **01 Social Hub v3** — la conexión Composio desbloquea publicar Y medir sin
   App Review; empieza con un spike de 1 día validando publish con la app
   gestionada.
3. **03 Conversaciones** — el mayor diferencial de producto; es ensamblar, no
   reconstruir.
4. **02 Conciliación** — concilia contra los cobros que la renovación genera.
5. **05 Conversiones + próximas acciones** — investigación hecha; falta elegir
   modelo (A embudo / B atribución / mezcla) antes de cerrar el diseño.

## Contexto compartido de los diseños

- **SaaS**: todo es tenant-aware desde el diseño; el campo `tenant` lo inyecta
  `multiTenantPlugin` — no se declara a mano. La única media nueva del sistema
  es la **imagen temporal del 01** (48h de vida, luego borrada; persiste solo
  una miniatura) — sin storage acumulativo.
- **IA**: se usa el AI SDK (Vercel) ya instalado con la config por tenant de
  `src/lib/ai-provider.ts` (Groq/OpenRouter/Anthropic), con fallback
  determinista cuando la IA no está configurada. La IA **propone, no actúa**:
  sugerencias con mensaje editable y CTA de un clic.
- **Mensajería**: OpenBSP sigue siendo el ente de conversación; Martes Hub es
  la capa de inteligencia y back-office sobre su espejo.
- **Payload — prácticas obligatorias del repo** (pitfalls del skill aplicados
  a este código):
  - La Local API **bypassa el access control** salvo `overrideAccess: false`
    + `user` — obligatorio en server actions y queries por usuario; jobs de
    sistema confiables van con `overrideAccess: true`.
  - Operaciones anidadas SIEMPRE con `req` (atomicidad de transacción).
  - `req.context` flags para cortar loops de hooks (patrón
    `skipLeadConversion` en `Clients.ts`).
  - Idempotencia por índice único + manejo del conflicto 23505
    (`isUniqueConflict` en `syncEmail`/`syncGcal`). Ojo: no "atrapar" el 23505
    para seguir consultando por el mismo `req` — la transacción queda abortada
    (lección de la review de Devin en el 04).
  - Sin `versions.drafts` en colecciones con UI custom (usar `select` de
    estado — decisión deliberada, ver comentario en `SocialPosts.ts`).
  - Queries de UI con `select` + `depth: 0` (patrón `crm-data.ts`).
  - Jobs = `TaskConfig` del jobs queue con `schedule`, registrados en
    `payload.config.ts`, con early return informativo si el integrador no
    está configurado.
