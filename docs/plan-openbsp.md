# Plan de integración OpenBSP (modo hosted) — F3

> Fuente de verdad: docs oficiales de OpenBSP leídas el 2026-08-25
> (`README`, `INTEGRATING.md`, `MIGRATING_FROM_TWILIO.md`). OpenBSP hosted =
> `https://nheelwshzbgenpavwhcy.supabase.co` + dashboard `web.openbsp.dev`.
> OpenBSP es PostgREST sobre Supabase: **cada tabla es un endpoint**.

## Modo de uso decidido

**Hosted, un solo tenant propio.** Nosotros somos consumidores API de OpenBSP;
OpenBSP es Tech Provider ante Meta por nosotros. Sin Supabase propio, sin app
Meta propia.

## Credenciales (mínimas)

| Valor | Origen | Dónde vive |
|---|---|---|
| `OPENBSP_API_KEY` | Dashboard → Settings → API Keys (rol `admin`) | env var |
| Organization ID | Auto al registrarse | campo del tenant (`openbspOrganizationId`) |
| Phone Number ID | Al conectar el número (Integrations → WhatsApp) | campo del tenant (`openbspPhoneNumberId`) |
| Publishable key + URL | Públicas del hosted | constantes default en código |
| `OPENBSP_WEBHOOK_TOKEN` | Lo generamos nosotros (secreto compartido del webhook) | env var |

## Capacidades cubiertas (API actual)

| Capacidad | Implementación |
|---|---|
| Recibir mensajes (webhook `messages insert`) | `/api/webhooks/openbsp`; filtro `sender_address ≠ null` para entrantes (los salientes también disparan) |
| Estados accepted/sent/delivered/read/failed (op `update`) | Merge del JSONB en nuestro doc; failed → notificación interna |
| Enviar text / media(image/video/audio/document/sticker) / template / location / contacts | `src/integrations/openbsp/client.ts` → INSERT en `/rest/v1/messages` con shapes exactos |
| Media por URL pública (v1) y Storage interno `internal://` (v2) | client soporta ambos |
| Ventana 24h cliente-servicio | Check contra `lastInboundAt`; fuera ⇒ solo template (evita error Meta 131047) |
| Conversaciones | Upsert por `openbspId` |
| Contactos (`contacts`, `contacts_addresses`) | Matching/enriquecimiento hacia `clients`/`leads` por teléfono |
| Cuentas conectadas (`organizations_addresses`) | Estado conexión; captura futura de `access_token` cifrada para envío Meta-directo |
| Errores/eventos Meta (`logs`) | Job poll diario de `level=error` → notificación interna |
| Plantillas | Sync desde `/rest/v1/templates` (job diario); envío con `content.kind: "template"` |
| Onboarding SaaS futuro | `onboarding_tokens` con `callback_url` única por tenant — receptor Meta-plano queda como punto de extensión (NO se construye ahora) |

## Autenticación REST (regla dura)

Dos headers en TODA llamada: `apikey: <publishable>` + `api-key: <secret>`.
NUNCA `Authorization: Bearer` hacia PostgREST (lo rechaza como no-JWT).
El Bearer sí se usa al revés: OpenBSP nos llama a NUESTRO webhook con
`Authorization: Bearer <OPENBSP_WEBHOOK_TOKEN>` si configuramos `token` en la
suscripción — así autenticamos sus POST.

## Idempotencia

Webhooks pueden reintentar: dedupe por `data.id` (uuid OpenBSP) y/o
`external_id` (WAMID). Upsert, nunca insert ciego. Los ecos de salida llegan con
`sender_address = null`: persisten como `direction=outbound`.

## Colecciones nuevas (todas tenant-aware)

- `conversations`: canal, openbspId, organizationAddress, contactAddress, client/lead rel, lastMessageAt, lastInboundAt (ventana 24h)
- `messages`: conversación, direction in/out, openbspId, externalId(WAMID), type, text, content json crudo, statusJson json, senderAddress, performedBy (humano), sentAt. Solo lectura desde admin (escritura = webhook o endpoint reply con overrideAccess)
- `message-templates`: name+language únicos por tenant, categoría, metaStatus, bodyText, componentsJson, openbspTemplateId

## Env vars finales

```
OPENBSP_API_KEY=<secreto del dashboard>
OPENBSP_WEBHOOK_TOKEN=<secreto que generamos>
# defaults embebidos, override opcional:
# OPENBSP_SUPABASE_URL, OPENBSP_PUBLISHABLE_KEY
```

## Sub-fases

- **F3a** (este PR): colecciones + campos tenants + migración + este doc
- **F3b**: client.ts + receptor webhook (idempotencia, matching contacto, upserts) → requiere credenciales reales
- **F3c**: envío (texto/media/plantilla) + endpoint de respuesta + inbox mínimo en admin
- **F3d**: sync plantillas diario + ventana 24h enforcement + poll de errores + enriquecimiento contactos
