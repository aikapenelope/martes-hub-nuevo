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

- Tab/apartado **"Conversaciones"** (o "Pulso") dentro de CRM, que abre la
  vista propia `/workspace/conversaciones`.
- Cada tarjeta deep-linka a la ficha 360 (`/workspace/crm/[type]/[id]`) y al
  inbox (`/workspace/inbox?c=<id>` — deep link ya existente).
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
4. Al abrir, registra activity (canal: whatsapp, tipo: retomar) y la tarjeta
   recalcula su alerta.
5. **Fallback determinista**: sin IA configurada, usa plantillas de
   `message-templates` con variables (nombre, empresa, monto pendiente).

## Recordatorios propuestos (cierre del círculo)

El mismo motor que detecta "X días sin respuesta" propone en la tarjeta:
"¿Crear seguimiento para mañana?" → un clic crea la tarea en Hoy con cliente y
contexto precargados. Así el loop completo es: detectar → proponer → un clic →
recordatorio → wa.me → actividad → el sentimiento se actualiza solo cuando el
cliente responde.

## Reglas de producto

- Todo es de solo análisis salvo dos escrituras: crear tarea y registrar
  activity. Nada del módulo escribe en `messages` ni en OpenBSP.
- Respuesta no es el objetivo: si el usuario quiere conversar, el deep link lo
  lleva a WhatsApp (donde vive la conversación real) o al inbox para leer.
- Multi-tenant por herencia: las queries parten de `conversations` ya
  aisladas por tenant.

## Checklist de implementación

- [ ] `conversation-intelligence-data.ts`: queries de tarjeta (sentimiento
      agregado, lastInbound vs outbound, chips, temperatura)
- [ ] Página `/workspace/conversaciones` + vistas lista/grid/kanban
- [ ] Tab "Conversaciones" en CRM con deep links
- [ ] `generateReengagementAction` + panel de variantes + wa.me + fallback
- [ ] "Crear seguimiento" → tarea en Hoy precargada
- [ ] Activity de retomada + badge de "sin respuesta" en Overview
- [ ] Tests de las queries (fixture: conversaciones con summaries)
