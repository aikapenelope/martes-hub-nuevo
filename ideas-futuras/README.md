# Ideas futuras

Documentos de diseño (no implementación) para los tres módulos acordados en la
sesión de análisis del 2026-09-08. Cada documento incluye el flujo completo, el
modelo de datos, las prácticas de Payload que aplican y un checklist de tareas
para cuando se ejecute el sprint.

| # | Idea | Resumen |
|---|------|---------|
| 01 | [Métricas de Instagram sin guardar media](./01-metricas-instagram-sin-media.md) | Conexión directa a la API oficial de Instagram (Instagram Login) + job diario de métricas. Cero imágenes: `post-metrics` solo números, `permalink` como referencia. Viable para SaaS. |
| 02 | [Conciliación de pagos desde WhatsApp](./02-conciliacion-pagos-whatsapp.md) | Captura de comprobante entrante → extracción con modelo de visión → `payments` en `por_confirmar` → botón único de confirmación en Billing. La imagen no se duplica: se referencia al mensaje. |
| 03 | [Inteligencia de conversaciones](./03-inteligencia-conversaciones.md) | Vista que concentra sentimiento, necesidades, antigüedad y temperatura por cliente/lead, con reactivación por IA y deep link `wa.me`. Estilo Attio/Intercom dentro del CRM. |

## Estado

Propuestos — pendientes de priorizar. Orden sugerido de construcción:
**02 → 03 → 01** (la conciliación es la más corta y todo su andamiaje existe;
la inteligencia es el mayor diferencial de producto; las métricas de Instagram
requieren trámite de App Review de Meta, así que el registro conviene iniciarlo
temprano aunque se construya al final).

## Contexto compartido de los tres diseños

- **SaaS**: todo es tenant-aware desde el diseño; ninguna idea introduce
  almacenamiento de imágenes nuevo (requisito cerrado para SaaS).
- **IA**: se usa el AI SDK ya instalado con la config por tenant de
  `src/lib/ai-provider.ts` (Groq/OpenRouter/Anthropic), con fallback
  determinista cuando la IA no está configurada.
- **Mensajería**: OpenBSP sigue siendo el ente de conversación; Martes Hub es
  la capa de inteligencia y back-office sobre su espejo.
- **Payload**: patrones obligatorios del repo — jobs idempotentes, `req` en
  operaciones anidadas (atomicidad), `req.context` para evitar loops de hooks,
  `overrideAccess: true` solo en jobs de sistema, y sin `versions.drafts` en
  colecciones con UI custom (usar `select` de estado como el resto del repo).
