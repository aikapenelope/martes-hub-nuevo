# 07 · Segundo WhatsApp por Composio (Cloud API) — mismo inbox

> Idea (2026-09-10): mantener el WhatsApp primario en OpenBSP como está (un
> solo número, robusto), y agregar un **segundo WhatsApp de negocio vía el
> toolkit WHATSAPP de Composio** (Cloud API de Meta) que **cae en el mismo
> inbox** con la misma paridad: lead auto-creado, conversación almacenada,
> sentimiento, recordatorios y pagos.

## Estado actual verificado (cómo funciona OpenBSP hoy)

**Inbound** (el flujo completo, código en `src/endpoints/openbspWebhook.ts` +
`src/integrations/openbsp/webhook-helpers.ts`):

```
OpenBSP (Supabase hosted) → POST /webhooks/openbsp
  1. resolveOpenBSPTenant: organization_id + organization_address → tenant
     (Tenants.openbspOrganizationId / openbspPhoneNumberId)
  2. Idempotencia por openbspId / external_id en `messages`
  3. upsertConversation por conversation_id → `conversations`
  4. create message (direction por sender_address; kind text/image/…)
  5. Inbound → encola `summarize-conversation` (sentimiento IA, sin bloquear)
  6. matchOrCreateLead: teléfono exacto → suelto (últimos 10 dígitos) →
     SI ES ENTRANTE Y DESCONOCIDO → auto-crea LEAD + activity en timeline
```

**Outbound**: Inbox/responder → `replyConversation` → `message-dispatch.ts`
(`SUPPORTED_CHANNELS`: whatsapp, instagram_dm, whatsapp_web) → `OpenBSPService`
(ventana 24h + idempotencia).

**La paridad que pediste YA EXISTE en el canal OpenBSP**: el usuario se crea
solo mientras escribe (auto-lead con su teléfono), las conversaciones y
mensajes se almacenan, el sentimiento se actualiza con los resúmenes IA, los
recordatorios salen de followups-today, y los pagos conciliarán con la idea 02.
Es la entrada principal del sistema. ✅

**El cambio multi-sesión**: `Tenants.openbspOrganizationId/openbspPhoneNumberId`
permiten un número por tenant. **Decisión**: el canal primario queda UNO — el
número de la plataforma (env). Los overrides por tenant ya son opcionales en el
código y se quedan como capacidad (si un cliente trae SU organización OpenBSP,
se asigna desde /admin); nadie los usa por defecto y no hay nada que revertir.

## El segundo WhatsApp: toolkit WHATSAPP de Composio

Verificado 2026-09-10 ([docs.composio.dev/toolkits/whatsapp](https://docs.composio.dev/toolkits/whatsapp)):

- Es la **WhatsApp Cloud API de Meta** — exige una **cuenta WhatsApp Business
  (WABA)**; no soporta WhatsApp personal. Es, por diseño, "el segundo número de
  negocio" — distinto al de OpenBSP.
- **Managed OAuth disponible**: el tenant conecta su WABA con login de Meta
  (mismo flujo del hub — botón → popup → conectado). También acepta API Key.
- **57 acciones**: `WHATSAPP_SEND_MESSAGE` (texto), `SEND_MEDIA`,
  `SEND_TEMPLATE_MESSAGE` (fuera de ventana 24h), botones/listas interactivas,
  history, phone numbers, etc.
- **1 trigger** de mensajes entrantes + `WHATSAPP_SUBSCRIBE_APP` (suscribir los
  webhooks del WABA) + `WHATSAPP_GET_MESSAGE_HISTORY`.

## Diseño

### 1. Conexión (hub)

Tarjeta **"WhatsApp (segundo número — Cloud API)"** en `tenant-connections`
(toolkit `whatsapp`, scope empresa). Conexión idéntica a Instagram: managed
OAuth → popup → `connectedAccountId`. Requisito del tenant: tener su WABA en
Meta Business.

### 2. Inbound — cae en el MISMO inbox

1. Al conectar: `WHATSAPP_SUBSCRIBE_APP` + activar el trigger de Composio con
   webhook hacia `/webhooks/composio/whatsapp` (endpoint nuevo, firma
   validada).
2. El endpoint reutiliza el pipeline de OpenBSP casi 1:1:
   - Resuelve tenant por la conexión (no por organization_id).
   - Idempotencia EN BD (review Devin): unique parcial en `messages`
     (`tenant` + id del mensaje de Composio — campo nuevo `composioMessageId`)
     + manejo del 23505 que TERMINA la request (la transacción abortada no
     acepta más queries). El query-first del pipeline OpenBSP no basta solo:
     dos entregas concurrentes del mismo wamid crearían duplicados. La misma
     migración puede blindar el camino OpenBSP (`openbspId`/`externalId`),
     que hoy tiene índices ordinarios.
   - `upsertConversation` con id determinista `composio-wa:{waba}:{chat_id}` y
     **`channel: 'whatsapp_composio'`**.
   - `matchOrCreateLead` (mismo matching exacto/loose + auto-lead + activity).
   - `queue summarize-conversation`.
   - **Paridad de pagos (review Devin)**: si el mensaje entrante es imagen →
     encolar `extract-payment-proof` (idea 02) igual que el camino OpenBSP,
     preservando los campos de contenido que el job de extracción necesita.
     Un comprobante al segundo número concilia igual que al primario.
3. El Inbox lista `conversations` del tenant sin importar el canal → el segundo
   número **aparece en el mismo inbox** con su badge de canal.

### 3. Outbound — responder desde el mismo inbox

`message-dispatch.ts` agrega el canal `whatsapp_composio`: en vez de
`OpenBSPService`, ejecuta `WHATSAPP_SEND_MESSAGE` vía la sesión Composio del
tenant. Misma ventana 24h, misma idempotencia por clave de mensaje. Fuera de
ventana: `SEND_TEMPLATE_MESSAGE` (fase 2 del doc).

## Consideraciones (Payload + repo)

- **Endpoint de webhook**: mismo patrón que `/webhooks/openbsp` — validación de
  firma, rate limit distribuido, idempotencia, `overrideAccess: true` (llamadas
  de sistema), `req.context` si hace falta cortar hooks.
- **El canal nuevo necesita schema (review Devin)**: `Conversations.channel`
  hoy solo admite 3 valores — agregar `'whatsapp_composio'` implica migración
  del enum en Postgres, `generate:types`, y revisar los consumidores
  exhaustivos del canal: `SUPPORTED_CHANNELS` en `message-dispatch.ts`, badge
  del Inbox, y cualquier filtro de canal. Sin eso, el create de la
  conversación es rechazado por validación y no aparece nada en el inbox.
- **Composio trigger = cobro por evento** (como todo tool call): el inbound por
  trigger consume cuota del proyecto del tenant — aceptable (es SU cuota); el
  primario OpenBSP sigue gratis en su propio canal.
- **Sin fallback entre canales**: si Composio falla en el segundo número, el
  error es visible en la conexión; el primario OpenBSP no se toca.
- Paridad con idea 02: los comprobantes que lleguen por el segundo número
  concilian igual (el pipeline de mensajes es el mismo).

## Checklist de implementación

- [ ] Toolkit `whatsapp` en `tenant-connections` + tarjeta del hub (managed OAuth)
- [ ] Al conectar: `WHATSAPP_SUBSCRIBE_APP` + registro del trigger con webhook al endpoint
- [ ] Schema: opción `whatsapp_composio` en `Conversations.channel` (migración de enum + generate:types) + revisar consumidores exhaustivos (`SUPPORTED_CHANNELS`, Inbox, filtros)
- [ ] Schema: unique parcial en `messages` (tenant + `composioMessageId`) + 23505 que termina la request; opcionalmente blindar también `openbspId/externalId`
- [ ] Endpoint `/webhooks/composio/whatsapp` (firma + idempotencia + pipeline compartido + normalize de media)
- [ ] Paridad de pagos: encolar `extract-payment-proof` en imágenes entrantes (cuando exista idea 02)
- [ ] `message-dispatch`: canal `whatsapp_composio` → `WHATSAPP_SEND_MESSAGE`
- [ ] Badge de canal en el Inbox para distinguir primario vs segundo número
- [ ] Tests del endpoint (fixture de mensaje entrante → lead creado + mensaje espejado; entrega concurrente → sin duplicados)
- [ ] Fase 2: plantillas fuera de ventana + botones interactivos
