# UI MIGRATION — del Tailwind puro (OLED) a shadcn/ui, con el esqueleto efferd como base

> Objetivo: **estabilidad visual** — el workspace adopta el esqueleto del
> bloque efferd (AppShell: sidebar colapsable + header con breadcrumbs +
> contenido centrado) calzado con el tema OLED actual, y todas las páginas se
> migran progresivamente a las primitivas shadcn (`src/components/ui/`).
> Ni big-bang ni rediseño: el esqueleto manda, las páginas mejoran sobre él.

## Estado actual (lo que ya tenemos en el repo — PR #121)

- shadcn inicializado (preset nova, base Radix, Tailwind v4):
  `components.json` + `src/lib/utils.ts` + tokens de tema en
  `src/styles/workspace.css` + 18 primitivas en `src/components/ui/`
  (button, card, table, tabs, dialog, sheet, sidebar, chart, dropdown-menu,
  tooltip, badge, breadcrumb, empty, input, kbd, separator, skeleton, avatar).
- Esqueleto efferd instalado como referencia: `app-shell.tsx` (AppShell),
  `app-sidebar.tsx`, `app-header.tsx` (breadcrumbs + trigger),
  `nav-group/nav-user/logo`, más demo de dashboard (dashboard*.tsx, charts,
  stats — SOLO referencia con datos por props).
- Las páginas existentes NO se han tocado ( siguen Tailwind puro + oled ).

## Principios de la migración

1. **El esqueleto manda**: una sola vez se adapta `AppShell` al workspace
   (rutas, ítems del sidebar, usuario, badges) y desde ahí TODAS las páginas
   viven dentro — centrado, header y sidebar consistentes por definición.
2. **Tema OLED primero**: los tokens shadcn se calzan a la paleta OLED
   (fase 0) ANTES de migrar cualquier página — así cada página migrada nace
   con el look correcto y no hay "páginas blancas" intermedias.
3. **Página que se toca, se migra**: cada página pasa completa (sin mezclas
   visibles de estilos dentro de la misma vista). `oled.tsx` queda congelado:
   se usa solo donde aún exista, hasta que su página migre.
4. **CI como red**: cada fase termina en PR con build verde; el preview de
   Vercel permite el antes/después.

## Equivalencias (oled → shadcn) — mapa de traducción

| Hoy (oled / custom) | Destino (shadcn) |
|---|---|
| `OledCard` / `oled-card` | `Card` + clases de tema |
| `KpiCard` | `Card` + `stats.tsx` del bloque (delta + icono) |
| `SectionHeader` | `CardHeader/CardTitle` + `Breadcrumb` cuando aplique |
| `StatusBadge` (tonos) | `Badge` (variants: success→default, danger→destructive…) |
| `EmptyState` | `Empty` |
| `Drawer` (overlays) | `Sheet` (lateral) |
| `Dialog` nativo (overlays.tsx) | `Dialog` shadcn (Radix) |
| `Table` a mano en páginas | `Table` + `TableEmpty` |
| Selects/inputs a mano | `Input`/`Select` (por agregar al init) |
| `NotificationBell`, `CommandPalette` | `DropdownMenu`/`Command` (por agregar) |
| `ActivityHeatmap`/`HourlyHeatmap` | se CONSERVAN — solo se re-teman con los tokens `chart-*` |
| `formater.ts` del bloque | se adopta para moneda/números (ya con formato es-VE del repo) |

## Fases (cada una = un PR con build verde + preview)

### Fase 0 — Theming OLED de los tokens shadcn (½ sesión)
- `src/styles/workspace.css`: sobrescribir `--background/--card/--border/…`
  con los valores OLED (negro #000, card #08080a, bordes #16161c, acentos
  cyan/indigo) en vez de los oklch claros del preset. Objetivo: cualquier
  componente shadcn nuevo nace viéndose OLED.
- Verificar que el admin de Payload (otro root layout) no se ve afectado.

### Fase 1 — El esqueleto manda (1 sesión)
- Adaptar `AppShell/app-sidebar/app-header` al workspace: ítems reales del
  `WorkspaceSidebar.tsx` (Principal/Operación/Configuración), nav-user con el
  usuario real, badge de notificaciones, sidebar colapsable persistente.
- Envolver el layout del workspace con `AppShell` (reemplazo de
  `WorkspaceSidebar` + `WorkspaceHeader`/Topbar + `MobileNavDrawer`).
- El contenido hereda centrado y espaciados del shell — las páginas internas
  NO cambian aún (cero riesgo visual fuera del chrome).
- Eliminar: `MobileNavDrawer` (Sheet del shell lo cubre), topbar duplicado.

### Fase 2 — Pilotos (2 sesiones)
- **Ajustes** (página más estática, valida formularios): `Card`, `Input`,
  `Select`, `Badge`, tabs de secciones.
- **Social Hub** (valida KPIs, tablas y tabs del composer): `KpiCard`→`Card`,
  tabla top-posts → `Table`, Drawer del composer → `Sheet`+`Tabs`,
  `chart` para alcance.
- Aquí se decide el look final con el usuario (preview de Vercel).

### Fase 3 — Operación diaria (2-3 sesiones)
- **Hoy / Inbox** (la entrada principal): lista de conversaciones → `Table`/
  lista shadcn, drawer del chat → `Sheet`, botones de acción → `Button`+
  `DropdownMenu`; heatmaps re-temados con `chart-*`.
- **CRM kanban + drawer**: columnas y tarjetas re-temadas (la lógica no cambia),
  `CrmLeadDrawer` → `Sheet`.
- **Tareas** (+ `tasks/[id]`) y **Actividades**.

### Fase 4 — Dinero (2 sesiones)
- **Billing / Membresías / Ofertas**: tablas → `Table`, dialogs de creación
  (`PaymentCreateDialog`, `MembershipCreateDialog`, …) → `Dialog` shadcn,
  KPIs → `Card`. Junto con la idea 04 (botón Renovar) si el orden de producto
  lo permite.

### Fase 5 — Resto (2 sesiones)
- Email, Campaigns, Notes, Documents, Media, Team, Segments, Feedback,
  Notifications, Whiteboard (solo chrome), Templates, Settings/
  automatizaciones.
- Limpieza final: borrar primitivas oled no usadas + overlays.tsx heredado +
  clase `oled-*` residual (`grep` en cero).

## Reglas durante la migración

- Página migrada = página completa (sin medias vistas).
- Nada de `server-only`, `overrideAccess`, sanitización de errores ni cambios
  de lógica en estos PRs: **solo presentación** (salvo revalidate/paths).
- Cada PR lista las páginas migradas + screenshots del preview.
- Los dialogs que crean registros (25+) se migran con su página, no antes.
- Composio/social/lógica de negocio: intocables en estos PRs.

## Definición de "terminado" (todo el cambio)

- [ ] Todos los `page.tsx` del workspace renderizan dentro de AppShell.
- [ ] Cero usos de `oled-*` / `oled.tsx` (grep en 0) — borrado del archivo.
- [ ] Tema OLED 100% via tokens (`--background/--card/--border/chart-*`).
- [ ] `tsc` + lint + CI verdes en cada fase; heatmap y charts re-temados.
- [ ] Navegación móvil por el Sheet del shell (MobileNavDrawer eliminado).
