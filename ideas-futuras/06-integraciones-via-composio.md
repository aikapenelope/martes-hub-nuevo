# 06 · Todas las conexiones vía Composio — auditoría y replanteo

> Idea (2026-09-09 noche): lo abierto con Instagram escala a **todo** el
> sistema — cada servicio externo del tenant se conecta con **login, no con
> keys**. Auditoría de qué usamos hoy, qué se migra a Composio, qué mejora y
> qué se queda igual. Complementa al doc 01 (Instagram) y lo extiende a Gmail
> y Google Calendar, que hoy funcionan con OAuth propio por env vars.

## Auditoría: cada conexión del sistema, hoy vs con Composio

### ✅ Se migra a Composio (login del tenant, cero keys)

| Integración | Hoy (código verificado) | Con Composio | Qué mejora |
|---|---|---|---|
| **Gmail** (`src/jobs/syncEmail.ts`) | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` + `GOOGLE_REFRESH_TOKEN` + `GMAIL_USER` por env: **UN solo buzón por deployment**, tenant fijo por `GMAIL_TENANT_SLUG`. Job cada 15 min espeja últimos 2 días a `email-messages` (idempotente por `providerId`), matching email → clients/leads + revinculación | El tenant conecta **su** Gmail con login; el job itera conexiones activas de `tenant-connections` (igual que sync-instagram itera cuentas) y usa las acciones Gmail del SDK (`GMAIL_LIST_*`/`GMAIL_FETCH_*`... el espejo y el matching **no cambian** — cambia el transporte) | **Multi-tenant real** (imposible hoy: un deployment = un buzón). Cero tokens Google que expiran. Cada cliente ve SU correo espejado, no el de Martes |
| **Google Calendar** (`src/jobs/syncGcal.ts`) | Mismas env vars Google + `GCAL_CALENDAR_ID` + `GCAL_USER`: **UN calendario por deployment**, tenant fijo. Job cada 15 min espeja [ahora-1d, +365d] a `appointments` (upsert por `gcalEventId`, cancela obsoletos), matching de asistentes → clients/leads. **Solo lectura** — "las citas las crea OpenBSP" | Igual de lectura: el tenant conecta **su** calendario (elige `calendarId` al conectar, guardado en `tenant-connections.config`), el job itera conexiones y usa `GOOGLECALENDAR_LIST_EVENTS` del SDK. La reconciliación de ventana y el matching no cambian | "Que se carguen desde donde estamos": el mismo panel de Calendario/Citas muestra las citas de cada tenant de SU calendario. Cero env vars. Fase 2 opcional: escribir (crear la cita en SU calendario desde el sistema) con `GOOGLECALENDAR_CREATE_EVENT` |
| **Instagram** (nuevo, doc 01) | No existe conexión (solo planifica) | Publish + métricas + insights vía SDK (doc 01 completo) | Publicar sin salir del sistema, métricas automáticas |

Todas comparten el mismo mecanismo del doc 01: key del proyecto Composio del
tenant en `tenant-integrations` (cifrada), conexión por login hosted en
`tenant-connections`, ejecución determinista con `tools.execute`. Los jobs
actuales (`sync-email`, `sync-gcal`) conservan su lógica de espejo/matching —
solo cambia de dónde salen los datos (env var global → conexión del tenant).

### 🔬 TikTok — sí se puede, con un paso extra

Toolkit oficial de Composio con 9 acciones
([docs.composio.dev/toolkits/tiktok](https://docs.composio.dev/toolkits/tiktok)):
`TIKTOK_UPLOAD_VIDEO` + `TIKTOK_PUBLISH_VIDEO` + `TIKTOK_FETCH_PUBLISH_STATUS`,
`TIKTOK_POST_PHOTO`, `TIKTOK_LIST_VIDEOS`/`TIKTOK_QUERY_VIDEOS`,
`TIKTOK_GET_USER_STATS`, `TIKTOK_QUERY_CREATOR_INFO` — o sea, **publicar
(foto/video) Y métricas**, igual que Instagram.

**Diferencia clave**: TikTok figura como "Composio-managed OAuth **not
available**" — hay que registrar una app propia en la plataforma de
desarrolladores de TikTok (con su proceso de aprobación para Content
Publishing) y configurarla como auth config **custom** en el proyecto
Composio. Es un paso único de setup (la app se reutiliza para todos los
tenants; el redirect apunta al callback de Composio). **Decisión**: fase
posterior a Instagram — primero validar el modelo completo con Gmail/GCal/IG
que son managed auth puro.

### ❌ Se queda como está (no es una conexión de tenant)

| Pieza | Por qué no Composio |
|---|---|
| **OpenBSP** (WhatsApp/IG DMs) | BSP específico (Venezuela): webhook entrante + envío propio. No hay toolkit que lo sustituya; es el ente de conversación |
| **Tally** (formularios) | Solo verificación de firma de webhooks entrantes — no hay llamadas salientes ni credenciales de servicio |
| **Resend** (`RESEND_API_KEY`) | Email de **plataforma** (invitaciones, notificaciones, campañas): infraestructura del operador, como S3. Que cada tenant use SU Gmail para campañas es otra decisión de producto (límites de envío de Gmail vs deliverability de Resend) |
| **S3/R2, Upstash, Postgres** | Infraestructura del deployment, no conexiones de servicio del tenant |
| **IA (Groq/OpenRouter/OpenAI/Anthropic)** | Ya es config por tenant (`ai-provider.ts` + CompanySettings) con fallback a env — no son "conexiones" de cuentas del usuario |

## Correcciones del modelo (review de Devin, aplicadas en el doc 01)

1. **La key del proyecto tiene UNA ubicación**: `tenant-integrations` = 1
   fila por tenant (solo la key cifrada + estado). `tenant-connections` = 1
   fila por (tenant, toolkit) con `authConfigId`, `connectedAccountId`,
   estado y config propia. Rotar key = actualizar la fila única.
2. **La verificación filtra por el auth config esperado**: varios toolkits
   comparten `martes-hub:{tenantId}` como userId, así que al verificar se
   selecciona solo el connected account que coincide con el `authConfigId` +
   `toolkit` pedidos — nunca "la primera cuenta de la lista".

## Plan de migración (se integra al plan del doc 01)

- **Fase 0 (spike)** — igual, Instagram.
- **Fase 1** — base BYO-key + hub de conexiones (Instagram + las tarjetas
  Gmail/GCal marcadas "próximamente" se activan aquí, mismo mecanismo).
- **Fase 2** — publish Instagram (doc 01).
- **Fase 2b — Gmail por conexión**: `sync-email` itera `tenant-connections`
  toolkit=gmail; env vars `GMAIL_*` quedan deprecated (backward-compat: si no
  hay conexión del tenant pero sí env vars, usa el camino viejo — solo para
  el tenant Martes durante la transición).
- **Fase 2c — GCal por conexión**: igual con `sync-gcal` + `calendarId` por
  conexión configurado al conectar.
- **Fase 3** — métricas + espejo Insights (doc 01).
- **Fase 4 (después)** — TikTok (app propia de TikTok + auth config custom) y
  escritura opcional en GCal (`CREATE_EVENT`).

## Checklist

- [ ] Fase 1: hub con tarjetas Gmail y Google Calendar activas (mismo mecanismo que IG)
- [ ] Fase 2b: `sync-email` por conexiones + `tenant-connections.config.mailbox` + deprecation de `GMAIL_*`
- [ ] Fase 2c: `sync-gcal` por conexiones + `config.calendarId` elegido al conectar + deprecation de `GCAL_*`
- [ ] Tests: espejo Gmail/GCal corriendo contra conexión del tenant (fixture de acciones SDK)
- [ ] Fase 4: spike TikTok (app propia + `TIKTOK_UPLOAD_VIDEO` → `PUBLISH_VIDEO` → `GET_USER_STATS`)
