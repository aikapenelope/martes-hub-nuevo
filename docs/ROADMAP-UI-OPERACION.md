# Roadmap — Sector UI (dashboard-9) y Sector Operacional

> Anotado para no entorpecernos: cada sector se trabaja en ramas propias
> sobre `main` y se integra por PR. Nada de esto bloquea la operación actual.
> La **Fase Final** (reset de BD + migración de datos reales) tiene su propio
> documento: `FASE-FINAL-MIGRACION.md` (PR #87) — se ejecuta al cierre.

## Estado del sector UI al día de hoy

Mergeado y vivo en `main`:
- **#93** Prospección (confirmación de envío, seguimientos 3d/7d/14d, filtros) + TrendStrip (sparklines 6 meses).
- **#94** Tipografía Geist Sans (híbrida: sans para títulos/números/cuerpo, mono para eyebrows/tags/metadatos) + display type en KPIs del CRM.
- **#95** Selector de rango Hoy/7D/1M/3M/1A, card de Quick Actions, display type en CockpitKpiGrid.
- **#92** ImportMap S3 (login de Payload restaurado en producción).

## Sector UI — pendiente del patrón dashboard-9 (adaptado a OLED, sin shadcn)

Decisión de arquitectura vigente: **no** instalamos shadcn/@efferd (registry
de pago + stack Radix incompatible con nuestro sistema de 74 componentes).
Adaptamos los patrones con SVG/HTML puro dentro del sistema OLED — como ya
se hizo con `TrendStrip`.

### 1. Chart segmentado de cobranza (el visual icónico de las fotos)
Barras verticales compuestas de segmentos redondeados apilados (blanco =
Cobrado, gris = Pendiente), 8 semanas, leyenda de dos series.
- Spec: `SegmentedBarChart` en `src/components/workspace/charts/` — SVG puro,
  cada barra = N segmentos de ~7px con gap 3px (`rx=2`), alto ∝ valor/máximo.
- Dato: `getWeeklyCashflow()` en `src/lib/trend-widgets.ts` — dos queries
  mensuales→semanales sobre `payments` (pagado por `paid_at`; pendiente/
  vencido por `due_date`), patrón SQL tenant-scoped de `db-aggregates`.
  ⚠️ Nota: `date_trunc('week')` devuelve 'YYYY-DD-MM' con mes/día
  intercambiados — ya detectado en la ronda abortada, mapear al comparar.
- Inserción: card grande en `/workspace` entre TrendStrip y Quick Actions.

### 2. Deltas ▲/▼ en TODAS las KPI cards
Hoy solo revenue tiene delta (`revenueTrendPct`). Extender `overview-data`
para calcular ventanas previas de: leads nuevos, actividades, conversión y
pipeline ponderado; exponer `xxxTrendPct` por métrica y alimentar las
prop `trend` que `KpiCard`/las cards del cockpit ya aceptan.

### 3. Embudo con píldoras de porcentaje
`CockpitConversionFunnel` existe — pulir: % dentro de píldora blanca por
etapa (100% → 53% → 23% → 8%), anchos proporcionales, gris degradado.

### 4. Barras punteadas en desgloses
`CockpitSourceBreakdown` — filas con barra punteada (dashed) y conteo a la
derecha, como "Traffic sources" de la referencia.

### 5. Quick Actions con chevron
La card existe — añadir chevron ">" a la derecha de cada fila.

### 6. (Opcional) Heatmap por hora del día
Variante "actividad por hora × día de semana" del heatmap anual existente.
Solo si sobra presupuesto visual después de 1-5.

## Sector Operacional — pendiente

1. **Scoring automático**: job que recalcula `nivelInteres`/`prioridad` desde
   señales ya capturadas (inbound WhatsApp, sentimiento de summaries,
   llamadas, días por etapa — reglas SLA de `followups-today`). Escribe al
   lead y dispara la automatización hot-lead existente.
2. **Sequences de email**: colección `Sequences` (pasos: email / tarea /
   esperar N días) + inscripciones + job; **stop por respuesta** reutilizando
   la detección inbound existente. Correos recurrentes solo a interesados.
3. **Triage estilo Linear en "Hoy"**: atajos j/k/E/S, acciones en lote,
   drawer sin cambiar de página (la cola ya calcula prioridad).
4. **Vistas guardadas del CRM**: filtros+agente+vista por usuario.
5. **Reportes de conversión**: entrada→contacto→calificado→cliente por
   origen y por agente en Analytics.
6. **Broadcast WhatsApp OpenBSP**: diseñado, **sin uso** — templates aprobados
   + opt-out; solo si el modelo manual de prospección se queda corto.

## Convención de trabajo

- Un sector = una rama = un PR (evitar apilamientos: tras mergear un PR
  base, retargetear los apilados o recrearlos desde main).
- Tras cada pull: `codegraph sync`.
- Antes de cada PR: `pnpm typecheck` + `eslint` + `next build` + paridad de
  tests contra `main`.
