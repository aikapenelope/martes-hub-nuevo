# 01 · Métricas de Instagram sin guardar media

> Idea: conectar el sistema a Instagram para traer métricas con un job diario —
> sin guardar imágenes, viable para SaaS. **Reescrito (2026-09-09): el
> transporte de v1 es Composio en modo determinista (sin LLM), no la Graph API
> directa.** Mismo modelo de datos que el diseño original; cambia el transporte
> y desaparece el App Review del camino crítico.

## Problema

El modelo actual de social delega publicación y métricas en un agente MCP
externo (Metricool/Composio) y usa `media` para los adjuntos. Para SaaS eso no
escala: almacenar las imágenes de cada tenant cuesta storage real (R2/S3), y el
agente externo es una pieza que alguien tiene que conectar y mantener.

**Estado real verificado en el repo (2026-09-09):** hoy nadie escribe en
`post-metrics`. `/workspace/social` muestra los 3 KPIs (alcance/impresiones/
interacciones) vía `getSocialMetricsSummary`, pero esa función es solo lectura
y su comentario asume que "un agente MCP conectado los escribe" — agente que no
existe. En `src/jobs/` no hay ningún job de social ni llamadas a Meta. La
verificación era correcta: hay que construir el productor de datos.

## Decisión cerrada

1. **Cero media nueva**: en `publicado` no se copia ninguna imagen; solo
   `platformPostId` + `permalink` (ya existen como campos en `social-posts`).
   Los thumbnails de Instagram NO se guardan: los CDN de Meta (`scontent`)
   expiran. En la UI, icono por tipo de post + link al permalink.
2. **Métricas deterministas, sin LLM**: job diario propio que consulta
   Instagram **a través de Composio en modo herramientas** (ejecución directa
   por SDK/REST, sin agente ni LLM en el camino — igual de determinista que
   llamar a la Graph API, pero sin app de Meta propia ni OAuth propio).
3. **Publicar queda fuera del sistema**: aquí se planifica y cada post lleva
   su link. El MCP de Metricool queda como uso humano opcional (pedir
   reportes a Claude), no como pipeline.

## Por qué Composio y no la Graph API (aún)

**No existe una API de Meta Business Suite** — Business Suite es solo la
interfaz; lo que la alimenta es la Graph API. Usarla directo exige: crear app
en developers.facebook.com, OAuth propio, tokens que expiran, y **App Review**
de Meta para que la use alguien más allá de ti.

Composio elimina las tres fricciones para v1:

| | Graph API directa | Composio (herramientas, sin LLM) |
|---|---|---|
| App de Meta propia | Requerida + App Review | No: Composio presta su app; el usuario solo aprieta "Conectar" |
| OAuth y refresco de tokens | Propio | Lo lleva Composio (connected accounts) |
| Ejecución | REST propio | `composio.tools.execute()` / `POST /api/v3.1/tools/execute/{slug}` — determinista |
| Migración a SaaS | — | Se registra la Meta app propia como credencial custom en Composio; el código no cambia |

Herramientas del toolkit de Instagram que usa el job (slugs vigentes en los
docs de Composio — ojo: "Get User Media" está deprecado, la vigente es
`INSTAGRAM_GET_IG_USER_CONTENT`):

- `INSTAGRAM_GET_IG_USER_CONTENT` — media de la cuenta (id, permalink,
  timestamp, tipo, like/comment counts).
- `INSTAGRAM_GET_IG_MEDIA_INSIGHTS` — métricas por post (reach, saved,
  shares/reposts, views).
- `INSTAGRAM_GET_USER_INSIGHTS` — métricas de cuenta (seguidores, profile
  views, website clicks).

Referencias: docs.composio.dev/toolkits/instagram ·
composio.dev/toolkits/instagram ·
developers.facebook.com/documentation/instagram-platform (para la fase SaaS).

Requisito único: la cuenta IG debe ser **Business/Creator** (gratis, se cambia
en la app de Instagram). Stories queda fuera de v1: sus insights expiran a 24h.

## Diseño

### 1. Conexión por tenant (`social-accounts` pasa de referencia a conexión)

**No se guardan tokens en la BD** — los tiene Composio (corrección sobre el
diseño anterior: los OAuth de Google de este repo viven en env vars, no en BD,
así que no había criterio de cifrado que copiar; con Composio el punto es
moot). Campos nuevos sobre los que ya existen (`accountName`, `platform`,
`platformAccountId`, `status`, `profilePictureUrl`):

| Campo | Tipo | Nota |
|---|---|---|
| `composioConnectedAccountId` | text | ID del connected account en Composio — la única llave que el sistema necesita |
| `externalUserId` | text | IG user id (devuelto al conectar; puede completar `platformAccountId`) |
| `lastSyncAt` | date | telemetría del job |
| `syncStatus` | select | `ok / error_token / error_api / sin_conectar` |

Flujo de conexión: server action `createInstagramConnectionAction` → pide a
Composio un link de conexión (hosted auth) → el usuario se loguea una vez →
callback/webhook de Composio (o polling en el primer sync) hace upsert de
`social-accounts` con el `composioConnectedAccountId`. Botón "Conectar
Instagram" en `/workspace/social` con estado vacío.

### 2. Job diario `sync-instagram-metrics`

Gemelo de `sync-email` / `sync-gcal`: `TaskConfig` con `schedule`, espejo de
solo lectura, **idempotente** (misma técnica: detectar conflicto de unique
constraint 23505 y saltar — ver `isUniqueConflict` en `syncEmail.ts`).

1. Early return si no está configurado (`isInstagramSyncConfigured()` — patrón
   `isGmailSyncConfigured`).
2. Para cada `social-accounts` con platform=instagram y connected account:
   `INSTAGRAM_GET_IG_USER_CONTENT`.
3. Por cada post nuevo: upsert de `social-posts` mínimo (estado `publicado`,
   `platformPostId`, `permalink`, fecha, `socialAccount`) — refleja TODA la
   actividad de la cuenta, no solo lo planeado aquí. Clave de búsqueda:
   `platformPostId` (con índice único si no existe aún).
4. Por cada post: `INSTAGRAM_GET_IG_MEDIA_INSIGHTS` → upsert en `post-metrics`
   con clave única (`post` + `recordedAt` = fecha del sync) — el re-run nunca
   duplica. La respuesta cruda va a `rawMetrics` (campo json que ya existe).
5. `INSTAGRAM_GET_USER_INSIGHTS` → una fila diaria de métricas de cuenta:
   `follower_count`, `profile_views`, `website_clicks` → colección ligera
   `social-account-metrics` (o JSONB diario en `social-accounts` si se prefiere
   no agregar colección).
6. Rate limits: con job diario, los límites de Meta sobran por órdenes de
   magnitud incluso con decenas de tenants.

### 3. UI (casi todo ya existe)

- Los 3 KPIs y el detalle por post de `/workspace/social` **ya consumen
  post-metrics** vía `getSocialMetricsSummary` — aparecen solos al poblar datos.
- Estados vacíos con CTA: "Conecta tu cuenta de Instagram" → flujo del punto 1.
- Tabla últimos 10 posts: fecha, tipo (icono), alcance, likes, comentarios,
  guardados, ER%. Link al permalink.
- Widget "Salud social" en Overview (sparkline 30 días de seguidores + ER%)
  como refinamiento posterior.

### 4. Fase SaaS (pospuesto, no olvidado)

Cuando el sistema pase a SaaS real: registrar la app propia en
developers.facebook.com (Business Login + App Review) y configurarla como
credencial custom dentro de Composio — **el código no cambia; cambian las
llaves**. Si algún día se quiere salir de Composio, el job ya encapsula las 3
llamadas: se reescriben por llamadas Graph directas detrás de la misma
interfaz.

## Env vars nuevas

```
COMPOSIO_API_KEY=          # única llave necesaria en v1
# Fase SaaS: la Meta app propia se registra como credencial custom en Composio
```

## Consideraciones al construir (Payload + estado del repo)

- **Local API y access control**: el job corre como sistema con
  `overrideAccess: true` (confiable — patrón `syncEmail`); las server actions
  de conexión con `overrideAccess: false` + `user` — la Local API **bypassa
  todo el access control** si no se pasa `overrideAccess: false` explícito.
- **Idempotencia del upsert**: `PostMetrics.ts` hoy NO define índice único en
  (`post`, `recordedAt`) — hace falta migración con el índice (o query-first)
  y manejar el conflicto 23505 como ya hacen `syncEmail`/`syncGcal` con
  `isUniqueConflict`. Sin esto, un re-run duplica filas.
- **Tenant**: `post-metrics` ya está en el `multiTenantPlugin`
  (`payload.config.ts:182`) — el campo `tenant` lo inyecta el plugin, no hay
  que declararlo a mano; el job debe iterar cuentas por tenant (parte de
  `social-accounts`, que ya es tenant-aware) y heredar el tenant al crear.
- **Sin `versions.drafts`**: el repo deliberadamente no usa `_status` en las
  colecciones con UI custom (comentario en `SocialPosts.ts`) — el estado va por
  `select`. No activar drafts en `social-accounts` ni en la colección nueva.
- **Atomicidad**: el upsert de post + métricas puede ir en la misma transacción
  pasando `req` a las operaciones anidadas (patrón obligatorio del repo).
- **Early return si no configurado**: el job debe devolver output informativo
  cuando `COMPOSIO_API_KEY` no existe (patrón `isGmailSyncConfigured`), para
  que el digest/monitoreo no acumule errores.
- **Costo por acciones de Composio**: job diario × 3 llamadas × N tenants —
  a escala SaaS son cientos de acciones/día; revisar plan de Composio antes de
  comprometer el pipeline (otro motivo para que el job encapsule las llamadas).
- **`rawMetrics` ya existe** en `PostMetrics` para la respuesta cruda — no
  agregar campos nuevos para auditar la extracción.

## Checklist de implementación

- [ ] Índice único en `post-metrics` (`post` + `recordedAt`) + índice único en `social-posts.platformPostId` (migración)
- [ ] Campos nuevos en `social-accounts` (`composioConnectedAccountId`, `lastSyncAt`, `syncStatus`)
- [ ] `createInstagramConnectionAction` + hosted auth de Composio + desconexión
- [ ] Cliente delgado `src/integrations/composio/client.ts` (execute por slug, tipado de las 3 herramientas)
- [ ] Job `sync-instagram-metrics` (TaskConfig + schedule, registrado en `payload.config.ts` jobs.tasks)
- [ ] Upsert idempotente de `post-metrics` + auto-creación de `social-posts` externos mínimos
- [ ] `social-account-metrics` (o JSONB diario) + widget de salud social
- [ ] Estados vacíos + botón "Conectar Instagram" + tabla top-posts en `/workspace/social`
- [ ] Test de integración del job (fixture del payload de Composio)
