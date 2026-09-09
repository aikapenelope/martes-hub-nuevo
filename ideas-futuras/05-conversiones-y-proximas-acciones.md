# 05 · Conversiones y próximas acciones (investigación de modelos)

> Idea (2026-09-09): una página de **conversiones** que se apoye en los
> reportes que ya existen en Analytics, y un **seguimiento interno con IA**
> que sugiera a quién contactar, cuándo y qué escribirle. Este doc es de
> **investigación**: presenta los modelos de referencia investigados con sus
> links para elegir cuál copiar antes de cerrar el diseño.

## Contexto que ya existe en el repo

- **Analytics ya tiene conversión por origen y por agente** (PR #108,
  `feat(ops)`): la página de conversiones no parte de cero — eleva esos
  reportes a una vista dedicada con embudo.
- Las señales del seguimiento ya están construidas: SLA por etapa
  (`followups-today.ts`), temperatura (`computeDealVelocity`), "sin responder"
  (`computeWindowState`), scoring con `nivelInteres` (`leadScoring.ts`),
  renovaciones próximas y cobros vencidos (jobs de `dinero`).
- IA lista para usar: `ai-provider.ts` (AI SDK de Vercel, config por tenant,
  fallback determinista).

## Página de conversiones — modelos investigados

### Opción A · PostHog — conversion goals + funnels (recomendada como layout)

- Links: [Conversion goals](https://posthog.com/docs/web-analytics/conversion-goals) ·
  [Funnels](https://posthog.com/docs/product-analytics/funnels) ·
  [Web analytics dashboard](https://posthog.com/docs/web-analytics/dashboard)
- Qué hace: tarjetas de "conversion goal" arriba del dashboard (conversión y
  tasa del evento clave), embudo por pasos con **conversión global y relativa
  entre etapas** (dónde se pierde la gente), y breakdowns por canal.
- Qué copiar: el layout — tarjetas de meta arriba, embudo por etapas del
  pipeline (lead → contactado → calificado → cliente → facturado) con el %
  relativo de cada salto, y desglose por origen/canal.

### Opción B · HubSpot — attribution reports (recomendada como semántica)

- Links: [Create attribution reports](https://knowledge.hubspot.com/reports/create-attribution-reports) ·
  [Understand attribution reporting](https://knowledge.hubspot.com/reports/understand-attribution-reporting)
- Qué hace: reportes de atribución por tipo de conversión (creación de
  contacto, creación de deal, revenue) con modelos de crédito (primer toque,
  último toque, lineal, U-shaped, full-path).
- Qué copiar: la **pregunta de negocio** — "¿qué fuente llena el embudo?" y
  "¿qué fuente cierra ventas?" — respondida con atribución simple
  primer/último toque sobre `leads.canal/origen` (el repo ya captura el origen
  en la creación del lead). Los modelos multi-touch (U/full-path) NO: exigen
  tracking de sesiones que este producto no tiene (el contacto nace en
  WhatsApp).

### Opción C · GA4/Mixpanel/Amplitude — descartadas por complejidad

Producto de medición de sesiones web; el journey de este producto es
conversacional (WhatsApp/IG), no de páginas. Solo se toma la idea de "embudo
con tasa de conversión por paso", que ya cubre la opción A.

**Recomendación**: mezcla A+B — layout de PostHog (meta cards + embudo con %
relativo + desglose por origen) con la semántica de HubSpot (atribución
primer/último toque al origen, respondiendo "qué llena" y "qué cierra").
Página propia `/workspace/conversiones` (entrada en sidebar, grupo
Configuración junto a Analíticas) con queries agregadas en `db-aggregates.ts`
(`select`, `depth: 0`, tenant-scoped).

## Próximas acciones — seguimiento interno con IA

Modelos investigados:

- **Salesforce Einstein — Next Best Action**: recomendaciones accionables por
  registro, cada una con rationale ("por qué ahora") y botón de ejecución.
  Referencia: [salesforce.com/sales/prospecting/agent](https://www.salesforce.com/sales/prospecting/agent/)
- **HubSpot — Prospecting Agent**: investiga prospectos, prioriza a quién
  contactar y redacta el follow-up ([knowledge.hubspot.com/prospecting/use-the-prospecting-agent](https://knowledge.hubspot.com/prospecting/use-the-prospecting-agent))
- Patrón común a copiar: **tarjeta de acción sugerida = quién + por qué ahora
  (con los datos que lo justifican) + mensaje pre-redactado editable + CTA de
  un clic**. El humano decide; la IA propone, no actúa sola.

Diseño propuesto (tamaño M):

1. **Motor de señales** (solo lectura, determinista): une lo que ya existe —
   SLA vencido (`followups-today`), lead caliente nuevo (`leadScoring`),
   sin respuesta nuestra (`computeWindowState`), oportunidad fría
   (`computeDealVelocity`), renovación a 7 días, cobro vencido. Cada señal
   produce una tarjeta con prioridad.
2. **Redacción IA** con `ai-provider.ts` (AI SDK, config por tenant): genera
   el texto sugerido para la tarjeta usando contexto del registro (último
   summary, etapa, monto pendiente, renovación). Cache por tarjeta (una
   generación, no una por render); **fallback determinista** a
   `message-templates` sin IA configurada.
3. **CTA de un clic**: wa.me prellenado (patrón de "Hoy") + crear tarea en Hoy
   + registrar activity. Nada escribe a OpenBSP ni envía solo.
4. **Ubicación**: bloque "Próximas acciones" arriba de Hoy (y en el Overview),
   mismo estilo que la cola de seguimientos que ya existe.

## Por decidir (bloquea el diseño final)

- [ ] Elegir modelo de conversiones: A (embudo PostHog), B (atribución
      HubSpot) o la mezcla recomendada.
- [ ] ¿Las tarjetas de próxima acción viven solo en Hoy o también como página
      propia con historial de sugerencias aceptadas/descartadas?

## Checklist tentativo (tras decidir)

- [ ] `conversiones-data.ts`: embudo por etapas + atribución por origen (queries agregadas)
- [ ] Página `/workspace/conversiones` (goal cards + embudo + tabla por origen)
- [ ] Motor de señales de próxima acción (une las señales existentes, prioriza)
- [ ] Redacción IA por tarjeta (cache + fallback a plantillas)
- [ ] CTAs de un clic + registro de aceptación/descarte de la sugerencia
- [ ] Tests de queries y del motor de señales
