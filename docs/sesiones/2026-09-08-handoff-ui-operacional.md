# Handoff — 2026-09-08: cierre sector UI → arranque sector operacional

> Prompt maestro para continuar en un chat nuevo está al final de este documento.

## Estado del repo y del proyecto

- **Repo**: `aikapenelope/martes-hub-nuevo` — martes-hub (Payload CMS 3.88 + Next.js 15 +
  Tailwind v4 + Postgres/Neon). Worktree activo de Orca:
  `/Users/angelpenalver/orca/workspaces/martes-hub-nuevo/main-2` (rama `main`).
- Codegraph indexado en ese worktree (`codegraph sync` tras cada pull).
- `.env.local` generado con `vercel env pull` (CLI logueado). Suite completa de tests
  requiere DATABASE_URL real; los fallos sin BD son ambientales y conocidos.
- **PR #100 (heatmap por hora) PENDIENTE DE MERGE** — todos los checks verdes, 4 rondas
  de Devin resueltas, listo.

## Sector UI: ✅ COMPLETO (roadmap docs/ROADMAP-UI-OPERACION.md)

| PR | Ítem | Contenido |
|---|---|---|
| #97 | 1 | Chart segmentado de cobranza (8 semanas, SVG puro, `getWeeklyCashflow`) |
| #98 | 2 + densidad | Deltas ▲/▼ en KPIs (convertedAt, ventanas reales) + OledCard compacta |
| #99 | 3-5 | Embudo con píldoras %, barras punteadas en desgloses, chevrons Quick Actions |
| #100 | 6 (opcional) | Heatmap por hora × día de semana con toggle, GROUP BY SQL, tz tenant |

Fixes de calidad aplicados durante las reviews (relevantes para el futuro):
- `overview-data.ts`: `fetchInteractionCounts()` — agregación SQL tenant-scoped con
  UNION ALL (activities/occurred_at + messages/sent_at COALESCE created_at +
  payments/paid_at), GROUP BY calendario local (tz parametrizada), fallback paginado
  RLS sin cap, frontera = medianoche local del día más antiguo del grid, guard de
  pertenencia al grid en `add()` (frontera DST).
- `leads.convertedAt` (migración `20260907_234500`) — instante de conversión persistido
  en las 3 rutas (crm-actions, convertLeadInSituAction, hook Clients).
- Deltas de captación/conversión por ventanas reales (`leadsNuevosTrendPct`,
  `conversionsInPeriod`, `conversionTrendPct`).
- Tipografía Geist Sans (híbrida sans/mono), densidad OLED (p-3.5/space-y-2/gap-2.5).

## Sector Operacional: PENDIENTE (ítems del roadmap)

1. **Scoring automático de leads** (siguiente a arrancar): job que recalcula
   `nivelInteres`/`prioridad` desde señales capturadas (inbound WhatsApp, sentimiento
   de summaries, llamadas, días por etapa — reglas SLA de `followups-today`). Escribe al
   lead y dispara la automatización hot-lead existente (`crm-pipeline-actions`).
2. **Sequences de email**: colección `Sequences` (pasos: email/tarea/esperar N días) +
   inscripciones + job; stop por respuesta reutilizando la detección inbound.
3. **Triage estilo Linear en "Hoy"**: atajos j/k/E/S, acciones en lote, drawer in-page.
4. **Vistas guardadas del CRM**: filtros+agente+vista por usuario.
5. **Reportes de conversión**: entrada→contacto→calificado→cliente por origen y agente
   en Analytics.
6. **Broadcast WhatsApp OpenBSP**: diseñado, sin uso — solo si el modelo manual de
   prospección queda corto.

Otros pendientes menores:
- `docs/FASE-FINAL-MIGRACION.md` (reset de BD + migración de datos reales; PR #87 si sigue abierto).
- Warning de build: colecciones exports/imports sin storage adapter (el commit
  descartado `d235db3` lo resolvía con 2 líneas en el s3Storage — recuperable del reflog).
- El chart semanal (`getWeeklyCashflow`) sigue anclado a America/Caracas por diseño
  (decisión pendiente: generalizar tz como en las series mensuales).

## Convenciones vigentes (incluye NUEVA regla)

- Un sector = una rama = un PR hacia main. No apilar PRs.
- Payload: `overrideAccess: false` + `user` + `tenantWhere` siempre; patrones de src/lib
  (`getWorkspaceContext`, `getScopedLead`); `use server` solo exporta async; agregaciones
  pesadas = SQL tenant-scoped via pool con GROUP BY en Postgres (tz parametrizada, nunca
  interpolada).
- Antes de PR: `pnpm typecheck` + `pnpm lint` + `pnpm build` + paridad de tests vs main.
- **NUEVA REGLA (memoria Serena `martes-hub-workflow`)**: al abrir un PR, DEJARLO ASÍ y
  avisar al usuario. NO reparar hallazgos de Devin automáticamente — el usuario los
  analiza y decide. (Reemplaza la convención vieja de reparar de inmediato.)
- Tests con BD real: branch efímera de Neon (proyecto `martesapp`, `rapid-bonus-33572154`),
  borrar al terminar. No usar el MCP de Supabase conectado (es otro proyecto).
- Migraciones de BD: verificar en branch Neon limpia antes de pushear.

---

## PROMPT MAESTRO (pegar en el chat nuevo)

> Eres el agente de desarrollo de martes-hub-nuevo (Payload CMS 3 + Next.js 15 + Tailwind
> v4 + Postgres/Neon). Repo: aikapenelope/martes-hub-nuevo, worktree Orca activo:
> /Users/angelpenalver/orca/workspaces/martes-hub-nuevo/main-2 (rama main, codegraph
> indexado — corre `codegraph sync` tras cada pull). Lee `docs/sesiones/2026-09-08-handoff-ui-operacional.md`
> (handoff completo) y `docs/ROADMAP-UI-OPERACION.md` (roadmap vivo).
>
> CONTEXTO: el sector UI está COMPLETO (#97-#100 mergeados o listos: el PR #100 heatmap
> por hora queda pendiente de merge — confírmalo con `gh pr view 100`). Arrancamos el
> SECTOR OPERACIONAL del roadmap, empezando por el ítem 1: scoring automático de leads.
>
> REGLAS DE TRABAJO (obligatorias):
> - Una tarea = una rama = un PR hacia main. No apilar PRs.
> - Payload: siempre `overrideAccess: false` + `user` + `tenantWhere` en operaciones
>   user-facing; usar los patrones de src/lib (getWorkspaceContext, getScopedLead);
>   `use server` solo exporta funciones async; agregaciones pesadas = SQL tenant-scoped
>   via pool con GROUP BY en Postgres y la tz del tenant parametrizada (nunca
>   interpolada) — ejemplos en src/lib/trend-widgets.ts y fetchInteractionCounts en
>   src/lib/overview-data.ts.
> - Antes de PR: pnpm typecheck + eslint + next build + paridad de tests vs main (los
>   fallos de api/inbox/tasks/crm-pipeline/offers-billing/billing son ambientales sin
>   DATABASE_URL; para verificación con BD real usa una branch efímera de Neon — MCP
>   conectado, proyecto martesapp — y BÓRRALA al terminar).
> - **Al abrir un PR: DÉJALO ASÍ y avísame. NO repares hallazgos de Devin por tu cuenta —
>   yo los analizo y te digo si los arreglas** (memoria Serena: martes-hub-workflow).
> - Usa CodeGraph para explorar antes de editar y pregunta antes de decisiones de
>   producto (no de implementación).
>
> TAREA: implementa el ítem 1 del sector operacional (docs/ROADMAP-UI-OPERACION.md):
> job de scoring automático que recalcula nivelInteres/prioridad de los leads desde las
> señales ya capturadas (inbound WhatsApp, sentimiento de conversation-summaries,
> llamadas, días por etapa — reglas SLA de src/lib/followups-today.ts), escribe al lead
> y dispara la automatización hot-lead existente. Patrón de jobs: src/jobs/*.ts +
> registro en payload.config.ts.
