# Ideas futuras

Documentos de diseño (no implementación), priorizados en la revisión del
2026-09-09. Cada documento incluye el flujo completo, el modelo de datos, las
prácticas de Payload que aplican, **consideraciones de construcción ancladas
al estado real del repo** y un checklist para ejecutar el sprint.

| # | Idea | Resumen |
|---|------|---------|
| 04 | [Renovación de membresías en 1 clic](./04-renovacion-membresias-1-clic.md) | **Nuevo.** Botón "Renovar" → cobro pendiente nace solo, `renewalDate` se adelanta, el sistema de pagos existente hace el resto. Tamaño S, patrón probado (`convertQuoteToInvoiceAction`). |
| 03 | [Inteligencia de conversaciones](./03-inteligencia-conversaciones.md) | Página propia `/workspace/conversaciones` (sidebar, no tab del CRM) que concentra sentimiento, necesidades, antigüedad y temperatura por cliente/lead, con reactivación por IA y deep link `wa.me`. ~60% del motor ya existe repartido en 5 sitios. |
| 01 | [Métricas de Instagram sin guardar media](./01-metricas-instagram-sin-media.md) | **Reescrito.** Conexión vía **Composio en modo determinista (sin LLM)** — hosted auth, sin app de Meta propia ni App Review para v1. Job diario espeja métricas a `post-metrics`. Cero imágenes: `post-metrics` solo números, `permalink` como referencia. Viable para SaaS. |
| 02 | [Conciliación de pagos desde WhatsApp](./02-conciliacion-pagos-whatsapp.md) | Captura de comprobante entrante → extracción con modelo de visión → `payments` en `por_confirmar` → botón único de confirmación en Billing. La imagen no se duplica: se referencia al mensaje. |

## Estado

Priorizado. Orden de construcción acordado:

**04 → 03 → 01 → 02**

1. **04 Renovación 1-clic** — lo más corto, cierra el círculo del dinero.
2. **03 Conversaciones** — el mayor diferencial de producto; es ensamblar, no
   reconstruir.
3. **01 Métricas Instagram** — Composio quita el App Review de Meta del camino
   crítico; el registro de la app propia se pospone al SaaS real y entonces
   solo cambian las llaves, no el código.
4. **02 Conciliación** — se mantiene como está; encaja después del 04 porque
   conciliará contra los cobros que la renovación genera.

## Contexto compartido de los diseños

- **SaaS**: todo es tenant-aware desde el diseño; ninguna idea introduce
  almacenamiento de imágenes nuevo (requisito cerrado para SaaS). El campo
  `tenant` lo inyecta `multiTenantPlugin` — no se declara a mano.
- **IA**: se usa el AI SDK ya instalado con la config por tenant de
  `src/lib/ai-provider.ts` (Groq/OpenRouter/Anthropic), con fallback
  determinista cuando la IA no está configurada.
- **Mensajería**: OpenBSP sigue siendo el ente de conversación; Martes Hub es
  la capa de inteligencia y back-office sobre su espejo.
- **Payload — prácticas obligatorias del repo** ( Pitfalls del skill aplicados
  a este código):
  - La Local API **bypassa el access control** salvo `overrideAccess: false`
    + `user` — obligatorio en server actions y queries por usuario; jobs de
    sistema confiables van con `overrideAccess: true`.
  - Operaciones anidadas SIEMPRE con `req` (atomicidad de transacción).
  - `req.context` flags para cortar loops de hooks (patrón
    `skipLeadConversion` en `Clients.ts`).
  - Idempotencia por índice único + manejo del conflicto 23505
    (`isUniqueConflict` en `syncEmail`/`syncGcal`).
  - Sin `versions.drafts` en colecciones con UI custom (usar `select` de
    estado — decisión deliberada, ver comentario en `SocialPosts.ts`).
  - Queries de UI con `select` + `depth: 0` (patrón `crm-data.ts`).
  - Jobs = `TaskConfig` del jobs queue con `schedule`, registrados en
    `payload.config.ts`, con early return informativo si el integrador no
    está configurado.
