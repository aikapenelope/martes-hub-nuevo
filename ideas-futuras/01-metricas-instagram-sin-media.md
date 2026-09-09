# 01 · Social Hub: publicar directo, media temporal y espejo de Insights

> **v4 (2026-09-09 noche) — integra el SDK oficial de Composio y define el
> modelo de cuota.** Sobre la v3 (publicar directo + media 48h + espejo de
> Insights): el transporte es el SDK `@composio/core` (no REST crudo), y cada
> **tenant aporta su propia cuenta Composio** (BYO-key) — la cuota free de
> cada quien, sin agotar la del operador. Diseñado para SaaS: multi-tenant ya
> existe, la key vive cifrada por tenant. **Sin fallback a la API de Meta**:
> si Composio falla, la UI muestra el error y se espera a que mejore.

## Problema

El modelo actual de social solo planifica: nadie escribe `post-metrics` (los 3
KPIs de `/workspace/social` leen una tabla vacía — `getSocialMetricsSummary` es
solo lectura y su comentario asume un agente que no existe), no hay ningún job
de social en `src/jobs/`, y publicar exige salir del sistema a la app de
Instagram a mano.

## Decisión cerrada (v3)

1. **Publicar directo desde el sistema**: composer tipo Metricool — se sube la
   imagen, se escribe el caption, botón **Publicar** (o programar para más
   tarde). La publicación usa la Content Publishing API de Instagram a través
   de Composio: crear contenedor (`image_url` pública + `caption`) → publicar.
2. **Media temporal de 48h**: la imagen vive en S3/R2 solo durante la ventana
   de publicación — Instagram **copia la imagen a su propio CDN** al publicar,
   así que borrar la nuestra no afecta el post. Un job TTL elimina el original
   a las 48h; solo queda una **miniatura pequeña** para el historial. Storage
   constante, viable para SaaS.
3. **Historial simple**: lista de lo publicado — miniatura + descripción +
   fecha + permalink + métricas de la última medición. Nada más.
4. **Espejo de Instagram Insights**: la sección de métricas replica el layout
   de la app de Instagram/Business Suite — tarjetas de cuenta (alcance,
   impresiones, interacciones, seguidores) y grid de posts con sus insights
   por post. Mismo vocabulario visual que ya conoce el usuario.
5. **Login sencillo con Composio**: Connect Link de hosted auth — el usuario
   aprieta "Conectar Instagram", se loguea una vez, y Composio lleva OAuth,
   tokens y refresh. Requisito: cuenta IG **Business/Creator** (gratis).

## Corroboración: Composio sí permite publicar (verificado 2026-09-09)

El toolkit de Instagram de Composio tiene **36 acciones**, entre ellas todo el
ciclo de publicación y métricas ([docs.composio.dev/toolkits/instagram](https://docs.composio.dev/toolkits/instagram)):

| Acción | Para qué |
|---|---|
| `INSTAGRAM_POST_IG_USER_MEDIA` | Crear el contenedor de media (inputs: `image_url` **pública**, `caption`, `video_url`) |
| `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH` | Publicar el contenedor (el paso 2 del flujo oficial) |
| `INSTAGRAM_CREATE_CAROUSEL_CONTAINER` | Carruseles (fase 2) |
| `INSTAGRAM_GET_IG_USER_CONTENT_PUBLISHING_LIMIT` | Cuota de la API: 25 publicaciones / 24h — el composer la muestra |
| `INSTAGRAM_GET_IG_MEDIA_INSIGHTS` / `INSTAGRAM_GET_USER_INSIGHTS` / `INSTAGRAM_GET_IG_USER_MEDIA` | Métricas por post y de cuenta (job diario) |
| `INSTAGRAM_GET_USER_INFO` | Datos de la cuenta conectada |

**Managed OAuth**: Composio mantiene la app de OAuth, el usuario la autoriza
mediante un **Connect Link** (hosted authentication), y Composio guarda y refresca
los tokens
([docs.composio.dev/toolkits/managed-auth](https://docs.composio.dev/toolkits/managed-auth))
— por eso no hace falta app de Meta ni App Review.

**Único riesgo a validar con un spike de 1 día** (antes de construir la UI
completa): el FAQ del toolkit indica que *algunas* herramientas pueden fallar
con la app gestionada (mencionan reply-to-comment). Validar en un script que
`POST_IG_USER_MEDIA` + `PUBLISH` + insights funcionan con el managed app. Por
decisión de producto **no hay fallback a la API de Meta**: si falla, la UI
muestra el error de Composio tal cual y se espera a que mejore.

## El SDK oficial (`@composio/core`) — verificado en docs y repo de Composio

Corroboración de la premisa: **el SDK expone exactamente las mismas acciones
que el MCP del agente, ejecutables directo sin LLM** — la doc oficial muestra
"Execute without an LLM":

```ts
import { Composio } from '@composio/core'

const composio = new Composio({ apiKey: tenantKey }) // server-side only

// Conectar: link de autenticación hosted (el usuario loguea en Instagram,
// no en Composio) — Composio guarda y refresca los tokens
const link = await composio.connectedAccounts.link(userId, instagramAuthConfigId)
// → link.redirectUrl (abrir en el navegador) → link.waitForConnection()

// Ejecutar (determinista, sin agente): requiere toolkitVersions fijado
const result = await composio.tools.execute('INSTAGRAM_POST_IG_USER_MEDIA', {
  userId,
  arguments: { image_url, caption },
})
```

Detalles del SDK que fijan el diseño:

- Paquete: **`@composio/core`** (TS v3). `tools.execute(slug, { userId,
  arguments })` es la ejecución directa; hay que pasar `toolkitVersions: {
  instagram: <versión fijada> }` en el init (o flag de skip) — lo fijamos
  para que el job no cambie de comportamiento solo.
- `userId` es un identificador **externo** nuestro: usaremos
  `martes-hub:{tenantId}` — Composio scopea los connected accounts por userId,
  así que cada tenant tiene su cuenta de Instagram separada dentro de su
  proyecto.
- Conexión: `composio.connectedAccounts.link(...)` devuelve `redirectUrl` +
  `waitForConnection()`; soporta `callbackUrl` de vuelta al workspace.
- **Solo servidor**: la key es secreta — el SDK se usa desde server actions y
  jobs, nunca desde el cliente (el repo ya marca `server-only` en libs sensibles).

**Payload ↔ Composio (verificado 2026-09-09)**: **no existe integración
oficial** entre ambos — ni plugin de Payload ni producto de Composio para
Payload. Hay un experimento comunitario ("Payload Agentic Connections",
Reddit r/PayloadCMS) que envuelve Vercel AI SDK + Composio, sin paquete npm
establecido. No hace falta: Composio es agnóstico del framework (su patrón
oficial de SaaS es SDK + connected accounts por usuario) y la integración
correcta en este stack es la delgada que ya define este doc — colección
`tenant-integrations` + cliente SDK + server actions, siguiendo los patrones
de plugin/colección del repo.

## Formas de conexión — decisión final: central por defecto + BYO opcional

Investigadas las tres formas (docs oficiales + API de organización de Composio):

| Forma | UX del tenant | Cuota | Veredicto |
|---|---|---|---|
| **A. Central (elegida, por defecto)** | **Un botón "Conectar"**: se abre el login del servicio real (Instagram/Google) en un popup; nadie abre Composio ni maneja keys | Come la cuota del operador (~20K gratis; Pro $29 + $0.0002/llamada extra) | Es el patrón SaaS oficial de Composio (userId por usuario final). Con sync diario acotado, 20K aguanta el stage actual; a SaaS, el costo va al precio |
| B. BYO-key manual | El tenant abre su cuenta Composio y pega su API key | Cuota propia — nadie agota la tuya | Se conserva como opción avanzada: la fila cifrada del tenant tiene precedencia sobre la central |
| C. Auto-provisioning por Org API | Igual de fácil que A | La API `org/owner/project/new` crea proyectos + keys programáticamente (`should_create_api_key: true` devuelve la key; sin límite de proyectos), pero el billing es de la organización: mismo costo que A con más complejidad operativa | Futuro: si Composio factura por proyecto, este es el camino — el modelo de datos ya lo soporta |

**Implementación** (PR #117): `getComposioForTenant` resuelve en dos niveles —
fila cifrada del tenant (BYO) → key del operador (central). El hub conecta con
un clic vía **popup** (patrón oficial de la skill: link hosted → callback page
`/auth/composio/callback` → postMessage → auto-verificación). Guardrails de
cuota central: sync diario (no horario) y 2 llamadas por publicación.

## Diseño
## Diseño

### 1. Conexión por tenant con BYO-key (SDK)

**Dos colecciones nuevas** (fix de review: la key del proyecto tiene UNA
ubicación autoritativa por tenant; el estado de cada toolkit va separado):

- **`tenant-integrations`** — **1 fila por tenant** (unique en tenant):
  `{ provider: 'composio', apiKeyCifrado, estado: ok/invalida }`. La única
  fuente de la key del proyecto Composio del tenant — cifrada AES-GCM
  (`src/lib/crypto.ts` nuevo, key en env `INTEGRATIONS_ENC_KEY`). Rotar la
  key = actualizar esta fila. Tu tenant de Martes usa `COMPOSIO_API_KEY`
  (env) como default.
- **`tenant-connections`** — 1 fila por (tenant, toolkit), índice único:
  `{ toolkit: 'instagram' | 'gmail' | 'googlecalendar' | ..., authConfigId,
  connectedAccountId, estado: conectando/ok/error_token/error_api,
  lastSyncAt, config propia (ej. calendarId del tenant) }`.

**Todo se configura programáticamente — el tenant nunca abre el dashboard de
Composio salvo para crear su cuenta y copiar su API key una vez.** Al pegar
la key, el sistema valida contra la API y, para cada toolkit que se active,
hace *get-or-create* del auth config gestionado con el SDK
(`authConfigs.list({ toolkit })` → si no existe,
`authConfigs.create(toolkit, { type: 'use_composio_managed_auth' })` →
`ac_xxx`). Ni OAuth apps propias ni scopes manuales: Composio las lleva.

**Flujo de conexión de cada toolkit** (Ajustes o `/workspace/social`):

1. `createConnectionAction(toolkit)` → `getComposioForTenant(tenantId)` (key
   cifrada de `tenant-integrations` → init SDK con `toolkitVersions` fijado)
   → auth config gestionado del toolkit →
   `connectedAccounts.link('martes-hub:{tenantId}', authConfigId,
   { callbackUrl: '/workspace/social' })` → el botón abre `redirectUrl`.
2. El usuario **loguea en el servicio real** — Instagram, Google, el que sea —
   en la página hosted de Composio. Las credenciales jamás pasan por Martes
   Hub ni por ningún modelo.
3. **Verificación con filtro por el auth config esperado** (fix de review:
   varios toolkits comparten el mismo userId — listar todas las cuentas del
   userId puede traer conexiones de otros toolkits): la verificación lista
   los connected accounts del userId y selecciona **solo** el que coincide
   con el `authConfigId` + `toolkit` pedidos (llevados desde
   `createConnectionAction` hasta el callback) → upsert en su destino
   (`social-accounts` para Instagram; `email-messages`/`appointments` para
   Gmail/GCal) → estado `ok`.

### 1b. Hub de conexiones en Ajustes (el "donde diga X, se loguea en X")

Pantalla **Conexiones** en `/workspace/settings` con una tarjeta por toolkit:

- **Instagram** (v1 de este doc): Conectar / Conectado (nombre de la cuenta) /
  error con el mensaje crudo de Composio. Botón desconectar.
- **Gmail, Google Calendar, Google Sheets, Google Docs** (slugs `gmail`,
  `googlecalendar`, `googlesheets`, `googledocs` — deshabilitadas con
  "próximamente" en v1; el mecanismo es idéntico, se activan por fase).
- Tarjeta de **consumo del tenant**: la API de usage de Composio
  (`POST /api/v3.1/project/usage/summary`, entidad `tool_calls`) permite
  mostrarle a cada quien cuántas llamadas lleva del mes sobre su cuota free —
  transparencia total: quien quiera consumir, consume, y ve cuánto le queda.

Cada conexión nueva es un botón que genera un Connect Link — cero configuración
manual por integración: "todo está cableado para hacer las llamadas correctas".

### 2. Composer de publicación (lo nuevo)

UI tipo Metricool en `/workspace/social`: campo de imagen (upload a `media`
con flag temporal), caption con contador, selector **Publicar ya / Programar**
(fecha y hora), y el contador de la cuota (`CONTENT_PUBLISHING_LIMIT`).

Flujo de `publishSocialPostAction` (publicar ya):

1. Upload de la imagen → `media` (S3/R2 vía `@payloadcms/storage-s3` que el
   repo ya tiene) + doc `social-posts` en estado `publicando` (reclamo
   condicional: `update where status in ['borrador','programado']` — un doble
   clic nunca publica dos veces).
2. `INSTAGRAM_POST_IG_USER_MEDIA` con `image_url` pública del S3 + caption.
3. `INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH` → `platformPostId` + `permalink` →
   estado `publicado` (o `fallido` + `lastError`, campos que ya existen).
4. Miniatura: Payload ya genera `imageSizes` al subir — la thumb del size
   pequeño queda como la imagen del historial.

Publicación real no es transaccional: el estado va `borrador → publicando →
publicado/fallido` y los errores quedan en `lastError` para reintento manual.

### 3. Programación (fase inmediata, no bloquea v1)

`scheduledAt` + job `publishScheduledSocialPosts` (gemelo de
`sendScheduledCampaigns`): cada corrida toma posts `programado` vencidos, los
pasa por el mismo flujo 1–3. Claim condicional por estado antes de llamar la
API — nunca duplica.

### 4. Job TTL: la imagen se borra a las 48h

Job diario `purgeExpiredSocialMedia`: busca `media` temporales de posts ya
`publicado` con más de 48h → borra el objeto original en S3 y marca el doc con
`purgedAt` (borrado lógico — el doc no se elimina para no romper referencias;
la miniatura vive en otro objeto pequeño). Cinturón y tirantes: regla de ciclo
de vida en el bucket para el prefijo temporal (`/temp-social/`), por si el job
falla. Como IG copió la imagen a su CDN, el post publicado no cambia.

### 5. Job diario de métricas + espejo de Insights

Igual que v2: `sync-instagram-metrics` (temprano en la mañana) →
`GET_IG_USER_MEDIA` → upsert mínimo de posts externos (`caption` requerido
con fallback `"(post externo)"`, `account`) → `GET_IG_MEDIA_INSIGHTS` por post
→ upsert idempotente en `post-metrics` (índice único `post`+`recordedAt`) →
`GET_USER_INSIGHTS` → fila diaria de cuenta.

UI **espejo de Instagram Insights** en `/workspace/social`:

- Fila superior de tarjetas de cuenta como la app de IG: **alcance,
  impresiones, interacciones, seguidores** (30 días) — mismo vocabulario.
- Grid de posts con miniatura + insights por post (alcance, likes,
  comentarios, guardados, ER%) — visualmente el "Content you shared" de IG.
- Debajo, el **historial simple**: lista plana (miniatura, caption, fecha,
  permalink) de todo lo publicado desde el sistema, con su estado.

## Env vars nuevas

```
INTEGRATIONS_ENC_KEY=   # clave AES-GCM para cifrar keys de integraciones por tenant
COMPOSIO_API_KEY=       # SOLO el proyecto del tenant Martes (default del propio tenant)
# S3_* ya existen en el repo (storage plugin)
```

## Plan de construcción (fases, con archivos)

**Fase 0 — Spike de validación (1 día, bloquea lo demás)**
- `scripts/spike-composio.ts` (tsx, fuera de Next): con una key real y una
  cuenta IG Business de prueba — `connectedAccounts.link('spike', ...)` →
  login manual → `GET_USER_INFO` → `POST_IG_USER_MEDIA` (image_url de
  placeholder público) → `PUBLISH` → `GET_IG_MEDIA_INSIGHTS`.
- Criterio: publish + insights funcionan con la app gestionada. Si falla,
  se documenta el error exacto y se decide (esperar mejora de Composio es la
  única vía — no hay fallback Meta).

**Fase 1 — Integración base (2–3 días)**
- `pnpm add @composio/core` (server-only) + `src/lib/crypto.ts` (AES-GCM).
- Colecciones `tenant-integrations` (1 fila por tenant: solo la key cifrada)
  y `tenant-connections` (1 fila por tenant+toolkit) + migraciones; **Hub de
  conexiones en Ajustes**: API key del tenant + tarjetas por toolkit
  (Instagram activo; Gmail/GCal/Sheets/Docs "próximamente") + tarjeta de
  consumo (usage API).
- `src/integrations/composio/client.ts`: `getComposioForTenant(tenantId)` —
  key de `tenant-integrations` o env para Martes; init con
  `toolkitVersions: { instagram: <fijada> }`; get-or-create de auth configs
  gestionados.
- Conexión de Instagram (link + callback con filtro por auth config + upsert
  `social-accounts` con `composioConnectedAccountId`/`externalUserId`/
  `syncStatus`) y desconexión.

**Fase 2 — Publicar (3–4 días)**
- Extender `SocialPostCreateDialog` (ya tiene caption + cuenta + programar +
  preview): añadir upload de imagen (patrón `MediaUploadDialog` del repo),
  botón **Publicar ya** y contador de cuota.
- `publishSocialPostAction` en `src/lib/social-actions.ts`: claim por estado
  (`borrador/programado → publicando`) → contenedor → publish →
  `publicado/fallido` + `lastError`. Miniatura = `imageSizes` de Payload.
- Job `purgeExpiredSocialMedia` (48h): borra objeto S3 + `purgedAt`
  (borrado lógico) + lifecycle rule del bucket para `/temp-social/`.
- Job `publishScheduledSocialPosts` (patrón `sendScheduledCampaigns`).

**Fase 3 — Métricas + espejo de Insights (3–4 días)**
- Migraciones de índices únicos (`post-metrics.post+recordedAt`,
  `social-posts.platformPostId`).
- Job diario `sync-instagram-metrics` (idempotente, 23505-aware) con las 3
  llamadas del SDK.
- UI en `/workspace/social`: tarjetas de cuenta (alcance/impresiones/
  interacciones/seguidores — vocabulario de IG Insights), grid de posts con
  miniatura + insights, historial simple debajo.

Estimación total: ~2 semanas. Cada fase deja algo usable (0: decisión go/no-go
· 1: conectar · 2: publicar · 3: medir).

## Consideraciones al construir (Payload + estado del repo)

- **Spike primero**: script que valide managed OAuth + publish + insights con
  una cuenta IG Business real antes de construir la UI (el FAQ advierte de
  limitaciones posibles de la app gestionada).
- **`image_url` pública**: el contenedor de IG exige una URL que sus servidores
  puedan descargar — el bucket S3/R2 público (o URL firmada con vida ≥ 1h) del
  storage plugin existente. Como IG copia la imagen, el TTL de 48h es seguro.
- **Doble publicación**: el claim condicional por `status` (`borrador/
  programado → publicando`) es obligatorio antes de llamar a Composio —
  patrón `convertQuoteToInvoiceAction` (`billing-actions.ts:398`).
- **Media purgada = borrado lógico**: `purgedAt` + delete del objeto S3, nunca
  delete del doc `media` (rompería referencias y auditoría).
- **Local API**: server actions con `overrideAccess: false` + `user` +
  validación de tenant; jobs de sistema con `overrideAccess: true`
  (early-return informativo si el tenant no tiene key de Composio
  configurada — patrón `isGmailSyncConfigured`).
- **Key cifrada, nunca en la respuesta**: `apiKeyCifrado` se cifra en
  beforeChange y solo se descifra en el servidor (`composio/client.ts`); el
  campo no sale en selects de UI (el campo `tenant` lo inyecta
  `multiTenantPlugin`, no se declara a mano).
- **Idempotencia de métricas**: índice único (`post`, `recordedAt`) en
  `post-metrics` + manejo 23505 (`isUniqueConflict` de `syncEmail`) — la
  colección hoy no tiene índice, hace falta migración.
- **Cuota 25/24h**: chequear `CONTENT_PUBLISHING_LIMIT` en el composer y en el
  job de programación; la UI lo muestra para no sorprender.
- **Sin `versions.drafts`**: estado por `select` (comentario en
  `SocialPosts.ts`); el tenant lo inyecta `multiTenantPlugin`, no se declara a
  mano.

## Checklist de implementación

- [ ] Spike Composio con el SDK (`scripts/spike-composio.ts`): managed OAuth → `POST_IG_USER_MEDIA` + `PUBLISH` + insights con cuenta real
- [ ] `pnpm add @composio/core` + `src/lib/crypto.ts` (AES-GCM) + `INTEGRATIONS_ENC_KEY`
- [ ] Colección `tenant-integrations` (key cifrada por tenant) + pantalla en Ajustes
- [ ] Campos en `social-accounts` (`composioConnectedAccountId`, `lastSyncAt`, `syncStatus`) + conexión vía SDK (link/callback) + desconexión
- [ ] `src/integrations/composio/client.ts` (`getComposioForTenant`, `toolkitVersions` fijado, execute por slug)
- [ ] Composer de publicación (upload + caption + publicar ya/programar + cuota) + `publishSocialPostAction` con claim por estado
- [ ] Job `purgeExpiredSocialMedia` (48h, borrado lógico + S3) + lifecycle rule del bucket
- [ ] Índice único `post-metrics` (`post`+`recordedAt`) + `social-posts.platformPostId` (migración)
- [ ] Job `sync-instagram-metrics` + upserts idempotentes + posts externos mínimos
- [ ] UI espejo de Insights (tarjetas de cuenta + grid de posts) + historial con miniaturas
- [ ] `publishScheduledSocialPosts` (programación, patrón `sendScheduledCampaigns`)
- [ ] Tests: fixture del flujo publish (contenedor→publicar), TTL purge, sync de métricas
