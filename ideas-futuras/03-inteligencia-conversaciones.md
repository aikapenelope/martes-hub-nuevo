# 03 · Inteligencia de conversaciones

> Idea: una vista que concentra TODO lo conversacional de cada cliente/lead —
> sentimiento, necesidades, desde cuándo escribe, temperatura — y que proponga
> mensajes listos para reactivar el contacto con deep link a WhatsApp.
> El inbox queda como espejo para analizar; responder sigue siendo de OpenBSP.

## Posicionamiento

OpenBSP es el ente de conversación; Martes Hub es la **capa de inteligencia**
sobre su espejo. Este módulo NO es una consola de respuesta: es el panel donde
se ve cómo está cada relación y qué toca hacer hoy. La materia prima ya existe
y llega sola: `messages` (webhook), `conversation-summaries` (worker de IA:
sentimiento, objeciones, próximos pasos), `conversations` (lastInboundAt,
labels, asignado).

## Referencias de diseño (a quién copiar)

| Producto | Qué toma | Qué se adapta |
|---|---|---|
| **Attio** | Página de registro que concentra IA + actividad + relaciones (el repo ya se inspiró en Attio para los lead briefs) | La tarjeta como "mini-ficha" con atributos IA arriba |
| **Intercom** | Customer context card junto a la conversación (sentimiento, última actividad, valor) | Las métricas de contexto por cliente |
| **HubSpot** | Timeline + señales de deal ("esta persona se está enfriando") | Las alertas accionables con CTA de un clic |

## Ubicación

- **Página propia `/workspace/conversaciones` con entrada en el sidebar**
  (`WorkspaceSidebar.tsx`, entre Inbox y CRM) y badge de "sin responder".
  Decisión (2026-09-09): NO como tab del CRM — el CRM es la ficha de datos por
  entidad y sus vistas guardadas ya tienen su propio modelo de filtros; esta
  vista es transversal (mezcla leads y clientes) y de análisis/activación, no
  de edición. Un tab añadiría un segundo modelo de filtros al CRM.
- Cada tarjeta deep-linka a la ficha 360 (`/workspace/crm/[type]/[id]`) y al
  inbox (`/workspace/inbox?c=<id>` — deep link ya existente, ver
  `inbox/page.tsx`).
- Sin colecciones nuevas: capa de queries sobre lo que ya hay.
  `src/lib/conversation-intelligence-data.ts` siguiendo el patrón de
  `crm-data.ts` (queries con `select` y `depth: 0`, aggregations de
  `db-aggregates.ts`).

## La tarjeta (unidad básica)

```
┌──────────────────────────────────────────────────────────┐
│ ● caliente   Ferretería La Unión          WA · IG  ⋯     │
│ Ana Pérez · contacto desde 12 ago                        │
│                                                          │
│ Sentimiento  ▁▃▅▇▅   ── se está enfriando (2 resúmenes)  │
│                                                        │
│ ⚠ Escribió hace 4 días · SIN RESPUESTA NUESTRA          │
│                                                        │
│ Necesitas: [precio] [entrega] [renovación]              │
│ Último resumen IA: "pide cotización de 3 meses,         │
│ objeción: precio vs competencia"                        │
│                                                        │
│ [ Retomar con IA ]  [ Crear seguimiento ]  [ Ver 360° ] │
└──────────────────────────────────────────────────────────┘
```

- **Temperatura** (caliente/templado/frío): derivada del sentimiento del último
  summary + frescura del contacto. Colorea el punto de la cabecera.
- **Sparkline de sentimiento**: evolución de los últimos N summaries — se ve de
  un vistazo si el cliente se enfría.
- **La alerta clave**: `lastInboundAt` > respuesta outbound más reciente →
  "escribió hace X · sin respuesta nuestra". Es el oro del módulo.
- **Chips de necesidad**: objeciones/peticiones extraídas de los summaries.
- **Vistas**: lista / grid / Kanban por temperatura (recicla los patrones
  kanban del repo). Filtros: canal, asignado, tenant (automático).

## Reactivación con IA (el botón "Retomar")

1. Server action `generateReengagementAction(id, tipo)` — usa `ai-provider.ts`
   (config por tenant; AI SDK ya instalado). Prompt con contexto: últimos
   summaries + último mensaje entrante + etapa/estado CRM + historial de
   contactos.
2. Genera 2–3 variantes según el tipo: **recordatorio de pago** /
   **seguimiento de venta** / **reactivación fría**.
3. Panel editable en la tarjeta: texto propuesto (editable) + botón
   **"Abrir WhatsApp"** → `https://wa.me/<telefono>?text=<urlencode>`
   (patrón click-to-chat que ya usa "Hoy").
4. Al abrir, registra activity (canal: whatsapp, tipo: retomar) — **solo
   timeline, la alerta NO se limpia**: la señal "sin respuesta" de
   `computeWindowState` deriva de `conversations.lastInboundAt` /
   `lastMessageAt`, y abrir el enlace no prueba que se haya enviado un
   mensaje. La tarjeta sigue marcada hasta que el espejo de OpenBSP reciba un
   outbound real (el usuario efectivamente escribió por WhatsApp) — esa es la
   única señal verificable; no se inventa un cierre anticipado.
5. **Fallback determinista**: sin IA configurada, usa plantillas de
   `message-templates` con variables (nombre, empresa, monto pendiente).

## Recordatorios propuestos (cierre del círculo)

El mismo motor que detecta "X días sin respuesta" propone en la tarjeta:
"¿Crear seguimiento para mañana?" → un clic crea la tarea en Hoy con cliente y
contexto precargados. Así el loop completo es: detectar → proponer → un clic →
recordatorio → wa.me → actividad (timeline) → la alerta se limpia sola cuando
el espejo registra el outbound real, y el sentimiento se actualiza cuando el
cliente responde.

## Reglas de producto

- Todo es de solo análisis salvo dos escrituras: crear tarea y registrar
  activity. Nada del módulo escribe en `messages` ni en OpenBSP.
- Respuesta no es el objetivo: si el usuario quiere conversar, el deep link lo
  lleva a WhatsApp (donde vive la conversación real) o al inbox para leer.
- Multi-tenant por herencia: las queries parten de `conversations` ya
  aisladas por tenant.

## Consideraciones al construir (Payload + estado del repo)

**Estado real verificado (2026-09-09):** la página no existe — no hay
`/workspace/conversaciones`, ni entrada en `WorkspaceSidebar.tsx`, ni
`conversation-intelligence-data.ts`. Lo que sí existe (~60% del motor, repartido):

| Pieza | Dónde vive hoy |
|---|---|
| Detectar "escribió y no respondimos" | `computeWindowState()` en `src/lib/crm-pipeline-window.ts` — badge "Por responder" del inbox y kanban |
| Temperatura caliente/templado/frío | `computeDealVelocity()` (mismo archivo, kanban) + `nivelInteres` persistido por `src/jobs/leadScoring.ts` |
| Sentimiento + objeciones/próximos pasos | `conversation-summaries` (worker `summarizeConversation`, campos `objeciones`/`nextSteps`) + `LeadBriefCard` |
| "X días sin respuesta" con SLA por etapa | `src/lib/followups-today.ts` (`LEAD_RULES`/`CLIENT_RULES` + `waLink` + `crmUrl`) |
| wa.me + deep links | kanban, triage y `followups-today` |

El trabajo es **ensamblar**, no reconstruir:

- **Local API y access control**: toda query de la capa de datos con
  `overrideAccess: false` + `user` + filtro de tenant — la Local API bypassa
  el access control si falta `overrideAccess: false` (patrón `crm-data.ts`).
- **Cómputo puro en lib**: temperatura derivada y agregación de sentimiento
  como funciones puras sin `import 'server-only'` (patrón `crm-pipeline-window.ts`,
  cuyos tests corren sin Postgres). No recalcular sentimiento: leer el de los
  summaries ya persistidos por el worker.
- **Las dos únicas escrituras** van como server actions con
  `getWorkspaceContext()` + `assertEditor` + validación de tenant (patrón
  `membership-actions`/`inbox-actions`):
  - Crear seguimiento: `tasks` ya tiene `title/description/dueDate/client/
    lead/assignedTo/source` para precargar la tarea con contexto.
  - Registrar retomada: `activities` ya tiene `type/occurredAt/summary/client/
    lead/performedBy`.
- **Operaciones anidadas con `req`** (atomicidad) y `req.context` flag si
  algún hook de `activities`/`tasks` pudiera re-dispararse (patrón
  `skipLeadConversion` de `Clients.ts`).
- **Sin `versions.drafts`** ni colecciones nuevas: cero cambios de esquema;
  el estado es derivado, no almacenado.
- **Deep links existentes**: `/workspace/inbox?c=<id>` (ya implementado) y
  `/workspace/crm/[type]/[id]` — reusar, no inventar rutas.
- **IA con fallback determinista**: `generateReengagementAction` usa
  `ai-provider.ts` (config por tenant) y sin IA configurada cae a plantillas de
  `message-templates` con variables — nunca bloquear el botón "Retomar" por IA.
- **Kanban por temperatura**: reciclar los patrones de `CrmPipelineWorkspace`;
  el badge del sidebar sigue el patrón del badge "Por responder" del Inbox.

## Checklist de implementación

- [ ] `conversation-intelligence-data.ts`: queries de tarjeta (sentimiento
      agregado, lastInbound vs outbound, chips, temperatura)
- [ ] Página `/workspace/conversaciones` + vistas lista/grid/kanban
- [ ] Entrada en `WorkspaceSidebar.tsx` (entre Inbox y CRM) + badge "sin responder"
- [ ] `generateReengagementAction` + panel de variantes + wa.me + fallback a
      `message-templates`
- [ ] "Crear seguimiento" → tarea en Hoy precargada (server action con
      tenant + assertEditor)
- [ ] Activity de retomada + badge de "sin respuesta" en Overview
- [ ] Tests de las queries y funciones puras (fixture: conversaciones con
      summaries)
