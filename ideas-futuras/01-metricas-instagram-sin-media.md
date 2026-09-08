# 01 · Métricas de Instagram sin guardar media

> Idea: conectar el sistema directamente a la API oficial de Instagram para
> traer métricas con un job diario — sin guardar imágenes, viable para SaaS.
> Investigado el 2026-09-08 contra la documentación vigente de Meta.

## Problema

El modelo actual de social delega publicación y métricas en un agente MCP
externo (Metricool/Composio) y usa `media` para los adjuntos. Para SaaS eso no
escala: almacenar las imágenes de cada tenant cuesta storage real (R2/S3), y el
agente externo es una pieza que alguien tiene que conectar y mantener.

## Decisión cerrada

1. **Cero media nueva**: en `publicado` no se copia ninguna imagen; solo
   `platformPostId` + `permalink` (ya existen como campos). Las imágenes de
   borradores quedan opcionales para el tenant que quiera planear, offloaded a
   R2. Los thumbnails de Instagram NO se guardan: los CDN de Meta (`scontent`)
   expiran, así que guardarlos es un problema, no una solución. En la UI se
   muestra un icono por tipo de post + link al permalink.
2. **Métricas oficiales, deterministas, gratis**: job diario propio que consulta
   la API de Instagram. Sin LLM en el camino (a diferencia del camino MCP).

## Corroboración: ¿"API de Meta Business Suite"?

**No existe una API de Meta Business Suite** — Business Suite es solo la
interfaz (dashboard). Lo que la alimenta, y lo que se suele anunciar como tal,
es la familia de **Graph APIs** de Meta (la propia documentación de Instagram
Platform mapea los nombres de tareas de la UI de Business Suite a tareas de la
Graph API). Las vías públicas reales para métricas de Instagram a septiembre
2026 son las de la tabla siguiente.

## Opciones de API (vigentes a 2026-09)

| Opción | Qué exige | Métricas | Veredicto |
|---|---|---|---|
| **Instagram API con Instagram Login** (la nueva) | Cuenta Business/Creator; OAuth "Business Login for Instagram" — **sin** Facebook Page ni cuenta FB en el loop. Scopes `instagram_business_*`. App Review. | Insights de media disponibles: reach, alcance, views, guardados, reposts, profile activity. Conteos rápidos por Media endpoint + analítica rica por Insights endpoint (Meta añadió métricas nuevas en abril 2026). | **Recomendada.** Pensada justo para apps SaaS, es la ruta ligera. |
| Graph API con Facebook Login (clásica) | FB Page vinculada a la cuenta IG + app review más pesada (`instagram_manage_insights`). | Las mismas + insights de la Page de FB. | Solo si algún día se quiere FB también. |
| Metricool / Composio vía MCP interno | Sin app review; LLM en cada sync; dependencia de tercero. | Depende del proveedor. | Mejor para publicar que para medir. Para métricas diarias es innecesario. |

Referencias: Meta — Instagram Media Insights
(`developers.facebook.com/documentation/instagram-platform/reference/instagram-media/insights`),
Meta — Instagram API with Instagram Login
(`developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login`),
Meta — blog de actualizaciones de métricas (abril 2026).

## Diseño

### 1. Conexión por tenant (`social-accounts` pasa de referencia a conexión)

Campos nuevos en `social-accounts` (los tokens van cifrados en BD, mismo
criterio que los OAuth de Google):

| Campo | Tipo | Nota |
|---|---|---|
| `platform` | select | ya existe; valores: instagram, facebook, tiktok… |
| `externalUserId` | text | IG user id (`GET /me`) |
| `accessToken` | text cifrado | token de larga duración de Instagram |
| `tokenExpiresAt` | date | para el aviso de re-autorización |
| `lastSyncAt` | date | telemetría del job |
| `syncStatus` | select | `ok / error_token / error_api` |

Flujo OAuth: endpoint callback (`/api/social/instagram/callback`) → canje de
code por token de larga duración → upsert de `social-accounts` con cifrado.

### 2. Job diario `sync-instagram-metrics`

Gemelo de `sync-email` / `sync-gcal` (espejo de solo lectura, idempotente):

1. Para cada `social-accounts` con platform=instagram y token válido:
   `GET /me/media?fields=id,caption,media_type,permalink,timestamp,like_count,comments_count`
2. Por cada post nuevo: `GET /{media-id}/insights` (reach, saved, shares/reposts,
   total_views) → **upsert en `post-metrics`** con clave única
   (`socialAccount/post externo` + `fecha`) — el re-run del job nunca duplica.
3. Los posts hechos fuera del sistema se auto-crean como filas `social-posts`
   mínimas (solo IDs, permalink, fecha, estado `publicado`) para que el
   dashboard refleje TODA la actividad de la cuenta, no solo la planeada aquí.
4. Métricas de cuenta (una fila diaria): `follower_count`, `profile_views`,
   `website_clicks` → nueva colección ligera `social-account-metrics` (o campo
   JSONB diario en `social-accounts` si se prefiere no agregar colección).
5. Rate limits: con un job diario los límites BUC de Meta sobran por órdenes de
   magnitud incluso con decenas de tenants.

### 3. UI (sencillo, cero imágenes)

- Widget **"Salud social"** en Overview: sparkline 30 días de seguidores,
  tasa de engagement, alcance semanal.
- Tabla **últimos 10 posts** en `/workspace/social`: fecha, tipo (icono),
  alcance, likes, comentarios, guardados, ER%. Link al permalink.
- **Top 3 del mes** y **mejor día/hora** (agregado de datos propios).
- Estados vacíos con CTA: "Conecta tu cuenta de Instagram" → OAuth.

### 4. App Review (el único trámite)

1. App en developers.facebook.com → producto "Instagram" con Business Login.
2. Scopes: `instagram_business_basic` + el de insights; Business Verification.
3. Screencast del flujo. Advanced Access.
4. Mientras tanto: modo dev con usuarios tester (suficiente para Martes Hub
   como negocio propio hoy).

## Env vars nuevas

```
IG_APP_ID=
IG_APP_SECRET=
IG_REDIRECT_URI=   # https://<dominio>/api/social/instagram/callback
IG_TOKEN_ENC_KEY=  # clave de cifrado de tokens (AES-GCM)
```

## Checklist de implementación

- [ ] App de Meta + App Review iniciado (bloquea solo el go-live, no el código)
- [ ] Cifrador de tokens reutilizable (`lib/crypto.ts`) + campos en `social-accounts`
- [ ] OAuth callback + desconexión
- [ ] Job `sync-instagram-metrics` + upsert idempotente de `post-metrics`
- [ ] Auto-creación de `social-posts` externos (mínimos)
- [ ] `social-account-metrics` (o JSONB diario) + widget de salud social
- [ ] Tabla top-posts en `/workspace/social` + estados vacíos
- [ ] Test de integración del job (fixture del payload de la API)
