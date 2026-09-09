# 01 · Social Hub: publicar directo, media temporal y espejo de Insights

> **v3 (2026-09-09 tarde) — DECISIÓN CAMBIADA por el usuario.** Antes era
> "métricas sin guardar media". Ahora: **publicar desde Martes Hub** (composer
> tipo Metricool: imagen + caption → directo a Instagram), la imagen es
> **temporal (se borra a las 48h)** y solo queda una miniatura en el historial,
> y la sección de métricas es un **espejo de Instagram Insights / Business
> Suite**. El transporte sigue siendo **Composio determinista (sin LLM) con
> managed OAuth** — sin app de Meta propia ni App Review.

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
`POST_IG_USER_MEDIA` + `PUBLISH` + insights funcionan con el managed app. Si
`instagram_content_publish` no estuviera en su scope, el fallback es registrar
la app propia como auth config custom en Composio (solo cambian las llaves; el
código no).

## Diseño

### 1. Conexión por tenant (igual que v2)

`social-accounts` gana `composioConnectedAccountId` (la única llave que el
sistema guarda — los tokens viven en Composio), `externalUserId`,
`lastSyncAt`, `syncStatus` (`ok / error_token / error_api / sin_conectar`).
Server action `createInstagramConnectionAction` → pide a Composio el Connect
Link → el usuario se loguea una vez → upsert de la cuenta. Botón "Conectar
Instagram" en `/workspace/social` con estado vacío.

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
COMPOSIO_API_KEY=     # única llave nueva; S3_* ya existen en el repo
```

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
  (early-return informativo si `COMPOSIO_API_KEY` falta — patrón
  `isGmailSyncConfigured`).
- **Idempotencia de métricas**: índice único (`post`, `recordedAt`) en
  `post-metrics` + manejo 23505 (`isUniqueConflict` de `syncEmail`) — la
  colección hoy no tiene índice, hace falta migración.
- **Cuota 25/24h**: chequear `CONTENT_PUBLISHING_LIMIT` en el composer y en el
  job de programación; la UI lo muestra para no sorprender.
- **Sin `versions.drafts`**: estado por `select` (comentario en
  `SocialPosts.ts`); el tenant lo inyecta `multiTenantPlugin`, no se declara a
  mano.

## Checklist de implementación

- [ ] Spike Composio: managed OAuth → `POST_IG_USER_MEDIA` + `PUBLISH` + insights con cuenta real
- [ ] Campos en `social-accounts` (`composioConnectedAccountId`, `lastSyncAt`, `syncStatus`) + Connect Link + desconexión
- [ ] Cliente delgado `src/integrations/composio/client.ts` (execute por slug, tipado de las acciones usadas)
- [ ] Composer de publicación (upload + caption + publicar ya/programar + cuota) + `publishSocialPostAction` con claim por estado
- [ ] Job `purgeExpiredSocialMedia` (48h, borrado lógico + S3) + lifecycle rule del bucket
- [ ] Índice único `post-metrics` (`post`+`recordedAt`) + `social-posts.platformPostId` (migración)
- [ ] Job `sync-instagram-metrics` + upserts idempotentes + posts externos mínimos
- [ ] UI espejo de Insights (tarjetas de cuenta + grid de posts) + historial con miniaturas
- [ ] `publishScheduledSocialPosts` (programación, patrón `sendScheduledCampaigns`)
- [ ] Tests: fixture del flujo publish (contenedor→publicar), TTL purge, sync de métricas
