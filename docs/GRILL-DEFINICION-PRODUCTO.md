# Grill de definición de producto — martes-hub

> **Cómo usarlo:** cada módulo tiene tres bloques: **cómo funciona hoy** (lo que el código hace de verdad, con referencias), **preguntas** (decisiones que necesito de ti — responde `[ ]` con A/B/C o texto libre) y **candidatas a construir** (features que hoy NO existen y probablemente necesites). Prioridad: 🔥 = define el roadmap / 🟡 = importante / ◻ = nice to have.
>
> Responde inline en este archivo o por números (ej: "W1: A, E3: dominio por tenant, C6: sí con reglas").

---

## 0.5. Estado real en producción (lo que el código no puede decirte)

1. ¿Cuántos tenants existen hoy y son reales o de prueba?
2. WhatsApp/OpenBSP: ¿está en vivo? ¿el número es de la agencia o de un cliente? ¿llegan mensajes reales?
3. Gmail: ¿el sync está activo (`GMAIL_SYNC_ENABLED`)? ¿qué buzón es?
4. Resend: ¿con qué remitente envía hoy (`RESEND_FROM`)? ¿dominio verificado o `onboarding@resend.dev`?
5. Crons: ¿has confirmado que llegan en prod los recordatorios/digest/envíos programados?
6. Agente MCP: ¿ya está conectado a algo real (Metricool/Composio) o es plan?
7. IA: ¿Groq/OpenRouter con key por tenant o env global? ¿se están generando resúmenes reales?
8. Archivos: ¿S3 configurado o los media/documents aún no van a bucket?
9. Datos: ¿cuántos leads/clientes/pagos reales hay hoy?
10. ¿Quién usa el sistema hoy: cuántas personas, con qué rol?

---

## 0. El sistema en una página (mapa de referencia)

| Módulo | Entrada | Núcleo | Salida |
|---|---|---|---|
| WhatsApp | Webhook OpenBSP firmado | `conversations` + `messages` | Respuestas vía API OpenBSP, resumen IA |
| Email entrante | Gmail API (solo lectura) | `email-messages` (espejo) | Matching automático a clientes/leads |
| Email saliente | Campañas / crons | `email-log` | Resend (un remitente global) |
| Campañas | Editor HTML + rubro | `email-campaigns` | Job por lotes de 15 → Resend |
| CRM | Webhook Tally, import CSV, manual | `leads`, `clients`, `companies` | Pipeline kanban, ficha 360°, conversión |
| Facturación | Manual / conversión quote | `payments`, `memberships`, `offers`, invoices | Recordatorios por email, PDF |
| Agenda | Google Calendar sync | `appointments` (solo lectura) | Vista calendario mensual |
| Social | Agente MCP externo | `social-posts` + `post-metrics` | Calendario editorial + métricas |
| Tareas | Manual | `tasks` | Kanban + checklist |
| Captación | Tally (HMAC) | `form-submissions` → leads | Feedback page |
| IA | Conversaciones | Groq/OpenRouter por tenant | Resúmenes con sentimiento |

---

## 1. WhatsApp / Mensajería (OpenBSP) 🔥

### Cómo funciona hoy (explicado)

1. **Proveedor:** OpenBSP *hosted* sobre Supabase (PostgREST). Auth con dos headers fijos (`apikey` + `api-key`), nunca Bearer. Config global por env: `OPENBSP_API_KEY`, `OPENBSP_PUBLISHABLE_KEY`, `OPENBSP_ORG_ID`, `OPENBSP_PHONE_NUMBER_ID` (`src/integrations/openbsp/client.ts`).
2. **Multi-tenant:** cada tenant puede sobreescribir `openbspOrganizationId` y `openbspPhoneNumberId` en su ficha (`src/collections/Tenants.ts:47-65`). Si no los tiene, usa el org/número global de las env vars. Es decir: hoy puede haber **un número compartido + overrides puntuales**.
3. **Entrada:** `POST /api/webhooks/openbsp` (Bearer token timing-safe + rate limit distribuido) crea/actualiza `conversations` y `messages`, y encola el resumen IA. Los usuarios **no pueden** crear/editar mensajes (collection fail-closed: `Messages.ts` deniega create/update a todos).
4. **Salida (3 vías):** endpoint REST `/api/messaging/reply`, quick-reply desde el pipeline CRM, y las acciones del inbox. Todas pasan por `sendText()`.
5. **Ventana de 24 horas de Meta:** si el último mensaje entrante es más viejo que 24h, el texto libre se rechaza con 409 y flag `needsTemplate` (`replyConversation.ts:57-68`). El quick-reply del pipeline aplica la misma ventana.
6. **Plantillas de Meta:** se sincronizan a diario (job `sync-templates`, 12:30) a `message-templates` con su estado (`metaStatus`). La UI `/templates` las muestra y permite registrarlas, pero el estado siempre viene de Meta (solo lectura).
7. **Instagram DM:** el cliente OpenBSP soporta `service: 'instagram_dm'` en `sendText` y los enums del CRM ya lo contemplan (`lastContactChannel`, `source`, `channel`)… pero **ningún endpoint ni UI lo usa**: el reply siempre va por WhatsApp.
8. **⚠️ Capacidades muertas:** `sendMedia()` (adjuntar imagen/video/audio/documento/sticker) y `sendTemplate()` (enviar plantilla con parámetros) están **implementados en el cliente pero nadie los llama**. La UI del inbox **no puede adjuntar archivos** ni responder fuera de ventana con plantilla. Es la brecha funcional #1 del módulo.

### Preguntas

- **W1 🔥 — ¿Números de WhatsApp por tenant?**
  - A) Un número compartido para todos los tenants (hoy, con overrides excepcionales)
  - B) Cada tenant su propio número/WABA (obligaría a completar `openbspPhoneNumberId` por tenant + validación)
  - C) Mixto: quienes traigan su WABA lo conectan; los demás usan el nuestro
- **W2 🔥 — ¿Qué experiencia cuando se vence la ventana de 24h?** Hoy: error 409 con `needsTemplate` y el usuario se queda sin acción.
  - A) Sugerir automáticamente una plantilla elegible desde el mismo error
  - B) Botón "enviar plantilla" que abre el selector de `message-templates` con parámetros precargados
  - C) Dejarlo como está (el agente va a /templates a mano)
- **W3 🔥 — ¿Campañas/broadcast por WhatsApp?** Hoy las campañas son solo email. `sendTemplate()` ya existe (muerto).
  - A) Sí: campañas de plantilla por rubro (como email, con lotes y log)
  - B) Solo envíos manuales uno a uno
  - C) No (riesgo de calidad/bloqueo de número ante Meta)
- **W4 🟡 — ¿Instagram DM real o de adorno?** O se activa (selector de servicio en inbox + reply con `service`) o se saca de los enums para no confundir.
- **W5 🟡 — ¿Estados de mensaje en UI?** Los estados de Meta (sent/delivered/read) llegan en `statusJson` crudo y no se muestran. ¿Quieres ticks (✓✓) en el chat?
- **W6 🟡 — ¿Asignación de conversaciones?** El campo `assignee` existe (con validación) pero no hay flujo de asignar/reasignar, ni "mis conversaciones", ni auto-asignación por regla.
- **W7 ◻ — ¿Auto-respuestas?** Mensaje de bienvenida, fuera de horario, palabras clave (precio, horario…) — hoy no hay nada.
- **W8 ◻ — ¿Cierre de conversación?** El estado existe (`open`/cerrada). ¿Auto-cierre tras X días de inactividad? ¿SLA de respuesta visible?
- **W9 ◻ — ¿Opt-out por WhatsApp?** Si el contacto escribe "STOP"/"BAJA", ¿marcarlo y suprimirlo de broadcasts?
- **W10 ◻ — ¿Volumen esperado?** (conversaciones/día) — define si hace falta paginación server-side en la lista de chats y más retención.

### Candidatas a construir (por orden de valor)

1. **Responder con plantilla cuando expira la ventana** (conecta `sendTemplate`, ya escrito) 🔥
2. **Adjuntos en el chat** (conecta `sendMedia` + subir a S3/media) 🔥
3. Campañas de plantilla WhatsApp por rubro (si W3=A)
4. Asignación + filtros "mías/no asignadas" + botón resolver
5. Ticks de entrega/lectura y búsqueda dentro de conversaciones
6. Auto-respuestas básicas (bienvenida / fuera de horario)

---

## 2. Email: buzón entrante e identidad de envío 🔥

### Cómo funciona hoy (explicado)

1. **Entrante = Gmail solo lectura.** Un único buzón (`GMAIL_USER`), OAuth con refresh token compartido (mismo client de Google que Calendar). El job `sync-email` corre cada 15 min, consulta `newer_than:2d`, espeja metadata (from/to/cc/subject/snippet, **sin adjuntos** ni cuerpo) a `email-messages`, y vincula cada correo a `clients`/`leads` por matching de dirección de email. Idempotente por `providerId`.
2. **⚠️ Un solo tenant:** `GMAIL_TENANT_SLUG` (default `martes`) fija **a qué tenant** va TODO el correo sincronizado. El multi-tenant no llega al email entrante.
3. **Saliente = Resend, un solo remitente global.** `RESEND_API_KEY` + `RESEND_FROM` (default `onboarding@resend.dev`). Todo lo que sale (campañas, recordatorios, digest) se registra en `email-log`. El webhook de Resend (firma Svix) actualiza estados: sent/delivered/bounced/complained/failed.
4. **No puedes responder correos desde el CRM.** La bandeja `/workspace/email` es de solo lectura; para responder tendrías que ir a Gmail.
5. **Los dos mundos no se cruzan:** WhatsApp vive en `conversations/messages`; el email espejado vive en `email-messages`. No hay inbox unificado.

### Preguntas

- **E1 🔥 — ¿Buzón por tenant?** Hoy: 1 buzón → 1 tenant (hardcode).
  - A) Un buzón por tenant (requiere flujo OAuth por tenant: "conectar Gmail" desde settings, guardar refresh token en company-settings)
  - B) Un solo buzón central para siempre (modelo agencia: tú ves todo)
  - C) Ahora B, preparar A para el segundo tenant
- **E2 🔥 — ¿Responder/redactar email desde el CRM?** Hoy imposible.
  - A) Sí: responder en el mismo hilo (requiere scope `gmail.send` o enviar por Resend con `reply-to`)
  - B) Solo plantillas de email rápidas que abren Gmail
  - C) No, el email del CRM es solo contexto de lectura
- **E3 🔥 — ¿Identidad de envío?** Hoy un solo `RESEND_FROM` para todos los tenants.
  - A) Dominio verificado por tenant en Resend (from = cada empresa) — el profesional
  - B) Un dominio de la agencia (from = hola@tuagencia.com en nombre del cliente)
  - C) Seguir con un solo remitente global
- **E4 🟡 — ¿Solo Gmail u otros proveedores?** (Outlook/IMAP). Gmail solo = más simple; Outlook abre mercado.
- **E5 🟡 — ¿Enviar desde Gmail real o desde Resend?** Salir por Gmail (`gmail.send`) hace que el hilo quede en el buzón del cliente y calienta reputación propia; Resend es más controlable para campañas. ¿Híbrido: 1-a-1 por Gmail, campañas por Resend?
- **E6 🟡 — ¿Vista de hilo?** `threadId` de Gmail ya se guarda; la UI lista mensajes sueltos. ¿Agrupar por conversación?
- **E7 ◻ — ¿Adjuntos de email?** El sync usa `format=metadata` (sin cuerpo ni adjuntos). ¿Necesitas verlos en el CRM?
- **E8 🟡 — ¿Supresión de rebotados?** Los bounces se registran en `email-log` pero no impiden reenvíos futuros. ¿Lista de supresión automática por tenant?
- **E9 ◻ — ¿Firma de correo por tenant/agente?** (HTML de firma al final de cada salida)
- **E10 ◻ — ¿Retención?** ¿Cuánto conservar `email-messages` (hoy: para siempre, ventana de sync 2 días)?

### Candidatas a construir

1. **"Conectar Gmail" por tenant** (OAuth en settings, guarda token, sync usa el token del tenant) 🔥
2. **Responder email desde el ficha/hilo** (si E2=A)
3. Lista de supresión automática de bounces
4. Vista de hilo agrupada + búsqueda de correo
5. Adjuntos (cuerpo completo + attachments en el espejo)

---

## 3. Campañas de email 🔥

### Cómo funciona hoy (flujo completo, explicado)

1. **Creación** (`/workspace/email`): nombre interno, asunto, preheader, `bodyHtml` (textarea HTML plano sanitizado con regex al guardar), audiencia = **un rubro** (`segment`) opcional, `scheduledAt` opcional.
2. **Audiencia real** (`sendCampaignTask.ts`): si hay rubro → leads de ese rubro (no descartados, no convertidos, con email) + clientes de ese rubro (etapa ≠ perdido, sin `optOutAt`, con email). **Si no hay rubro → TODOS los leads del tenant** (¡pero ningún cliente!). Dedupe por email. Límite implícito de 500 por colección.
3. **Despacho:** POST `/api/email-campaigns/:id/send` o la acción de la página → valida rol admin/agente, rechaza 409 si ya está `sending`/`sent`, marca `sending`, encola el job. Lotes de 15 envíos concurrentes, HTML envuelto en plantilla de marca, única variable `{{nombre}}` (⚠️ interpolada **sin escapar** — fix pendiente). Cada destinatario queda en `email-log` con su estado.
4. **Cierre:** estado final `sent`/`partial`/`failed`, `sentCount`, `sentAt`. El webhook de Resend actualiza `email-log`… pero **nunca actualiza `bouncedCount` de la campaña** (campo muerto).
5. **Programación:** `scheduledAt` solo se despacha si `EMAIL_CAMPAIGNS_AUTO_SEND=true` (job cada 15 min). Si una campaña se queda atascada en `sending` (crash), ningún watchdog la recupera.
6. **No existe:** cancelar un envío en vuelo, envío de prueba, preview, métricas de apertura/clicks, A/B testing, secuencias (drip), link de desuscripción.

### Preguntas

- **C1 🔥 — ¿Editor de campañas?** Hoy textarea de HTML crudo (para ti, no para un agente comercial).
  - A) Editor de bloques simple (título/texto/botón/imagen → HTML)
  - B) Plantillas fijas de marca con campos editables
  - C) Seguir con HTML (solo tú lo usas)
- **C2 🔥 — ¿Preview + envío de prueba?** Hoy no existe ninguno. (Barato y altísimo valor.)
- **C3 🔥 — ¿Unsubscribe legal?** `optOutAt` existe en clientes pero **no hay link de baja, ni landing, ni flujo que lo marque**. ¿Lo hacemos obligatorio (link auto en cada campaña + página de baja + supresión)?
- **C4 🔥 — ¿Segmentos dinámicos?** Hoy "segmento" = **rubro** (categoría de negocio). Las campañas apuntan a rubros.
  - A) Mantener rubro simple
  - B) Añadir audiencias dinámicas por reglas: etapa, ciudad, última actividad, "sin compra en X días", canal
  - C) Rubro ahora, reglas después
- **C5 🟡 — ¿Programación por defecto?** ¿Activar `EMAIL_CAMPAIGNS_AUTO_SEND` siempre y con respetar timezone del tenant? ¿Ventana horaria de envío (no mandar a las 3am)?
- **C6 🟡 — ¿Variables de personalización?** Solo `{{nombre}}`. ¿Cuáles más: `{{empresa}}`, `{{ciudad}}`, `{{agente}}`, `{{enlace}}`, fecha? (con escape HTML correcto)
- **C7 🟡 — ¿Métricas?** Aperturas/clicks requieren tracking propio o plan adecuado de Resend. ¿Dashboard por campaña (entregados/abiertos/clics/bajas)?
- **C8 ◻ — ¿Secuencias (drip)?** Ej: día 0 bienvenida → día 3 caso de éxito → día 7 recordatorio. Hoy solo one-shot.
- **C9 ◻ — ¿A/B de asunto? ¿Reenvío a no abridores? ¿Duplicar campaña como borrador?**
- **C10 ◻ — ¿Cancelación en vuelo?** Hoy una vez `sending`, no hay vuelta atrás. ¿Botón cancelar + watchdog?
- **C11 ◻ — ¿Cuál es el volumen esperado** (destinatarios/campaña, campañas/mes)? El límite de 500 por colección y los lotes de 15 están dimensionados para algo pequeño.
- **C12 ◻ — ¿Adjuntos en campañas?** (hoy imposible; para PDFs de ofertas iría mejor un link al documento)

### Candidatas a construir

1. **Fix inmediato:** escapar `{{nombre}}` + watchdog de campañas `sending` + webhook→`bouncedCount` 🔥
2. **Preview + envío de prueba** 🔥
3. **Flujo de desuscripción completo** (link, landing, supresión) 🔥
4. Editor de bloques o plantillas de marca (según C1)
5. Dashboard de métricas por campaña
6. Audiencias dinámicas por reglas (si C4=B)
7. Cancelación + duplicar campaña

---

## 4. CRM (leads, clientes, empresas, rubros) 🟡

### Ya lo tienes
Pipeline kanban de leads (nuevo/contactado/calificado/descartado), ficha 360° con timeline, conversión lead→cliente (y en-situ desde el kanban), actividades logueadas, empresas, rubros (con conteos SQL), import/export CSV con validación, agentes asignables, orígenes (manual/apify/tally/whatsapp/instagram/referido), campos de enriquecimiento (Google Maps, handle social, último contacto y canal).

### Preguntas

- **F1 🔥 — ¿Etapas de pipeline fijas o configurables por tenant?** Hoy hardcodeadas en la config del kanban (4 estados). ¿Cada empresa su pipeline con pesos/valores?
- **F2 🟡 — ¿Motivos de descarte y reactivación?** Descartado sin razón registrada. ¿Motivo obligatorio + campaña de reactivación?
- **F3 🟡 — ¿Gestión de duplicados?** No hay detección ni merge. ¿Merge manual de leads/clientes (mantiene actividades y mensajes)?
- **F4 🟡 — ¿Asignación automática de leads nuevos?** (round-robin entre agentes, o por rubro). Hoy quedan sin agente hasta que alguien los toma.
- **F5 ◻ — ¿Scoring/calidad de lead?** Por fuente, respuesta, engagement.
- **F6 ◻ — ¿SLA de primer contacto?** Lead sin contacto en X horas → notificación/tarea automática.
- **F7 ◻ — ¿Campos personalizados por tenant?** Hoy el esquema es fijo para todos.
- **F8 ◻ — ¿Vistas guardadas?** Filtros de CRM en URL, pero no guardados por usuario.
- **F9 ◻ — ¿Scraping Apify?** El enum `source` ya lo contempla. ¿Importación periódica de listados?

## 5. Facturación (pagos, membresías, cotizaciones) 🟡

### Ya lo tienes
Pagos con estado y vencimiento (+ recordatorios por email diarios), membresías con MRR y aviso de renovación a 7 días, ofertas por rubro, cotizaciones → facturas con PDF (plugin: impuesto 16%, términos 30 días, prefijos INV/COT), conversión cotización→factura→pago en el mismo drawer, workspace de 5 tabs con búsqueda y agregados SQL.

### Preguntas

- **B1 🔥 — ¿Cobro real o registro?** Hoy todo es registro manual. ¿Links de pago (Stripe/Pasarela local) dentro de factura/recordatorio?
- **B2 🔥 — ¿Valor fiscal?** ¿Esto debe producir facturas legales (serie, folio, datos fiscales, anulación) o es control interno y la factura la emite el contador?
- **B3 🟡 — ¿Moneda única USD?** El settings solo admite USD y el impuesto 16% está hardcodeado en el plugin. ¿Multi-moneda/impuesto por tenant?
- **B4 🟡 — ¿Renovación automática de membresía?** Al llegar la fecha, ¿crear el payment del ciclo nuevo automáticamente?
- **B5 ◻ — ¿Portal de cliente?** Link donde el cliente ve sus facturas/estado de cuenta.
- **B6 ◻ — ¿Presupuestos vencidos?** Las quotes con términos de 30 días no tienen expiración ni follow-up.

## 6. Tareas y agenda 🟡

### Ya lo tienes
Kanban de tareas (5 estados) con checklist, prioridad, vencimiento y responsable; detalle con edición; appointments **espejo de Google Calendar** (solo lectura, sync cada 15 min); vista calendario mensual unificada (citas + tareas + renovaciones); timezone configurable por tenant (⚠️ calendario/cockpit aún la tienen hardcodeada a Caracas).

### Preguntas

- **A1 🔥 — ¿Crear citas desde el CRM?** Hoy el calendario es de solo lectura: si quieres agendar una llamada con un lead y que se cree en Google Calendar, no se puede. ¿Bidireccional?
- **A2 🟡 — ¿Tareas desde el inbox/CRM?** "Crear tarea de seguimiento" desde una conversación o ficha (con vencimiento y responsable).
- **A3 ◻ — ¿Tareas recurrentes?** (reporte mensual, revisión semanal)
- **A4 ◻ — ¿Recordatorios de tareas?** El digest diario no incluye tareas vencidas — ¿sumarlas?
- **A5 ◻ — ¿Horarios de disponibilidad por agente?** (si se hace A1 con agenda pública tipo Calendly)

## 7. Redes sociales ◻

### Ya lo tienes
Cuentas (Instagram/Facebook), posts con ciclo borrador/programado/publicado/fallido + imágenes adjuntas, calendario semanal, métricas por post (alcance, likes, impresiones), y un **agente MCP externo** que crea/programa posts y anota métricas (la publicación real pasa por Metricool/Composio).

### Preguntas

- **S1 🟡 — ¿Publicación automática real o planificación + humano?** Si el agente MCP ya publica, ¿qué pasa si falla? (hay estado `failed` pero sin reintento)
- **S2 ◻ — ¿Flujo de aprobación?** Borrador → revisión del cliente/admin → programado.
- **S3 ◻ — ¿Comentarios/DMs de social al inbox?** Instagram DM ya es viable vía OpenBSP (W4).

## 8. Captación (Tally → leads) ◻

### Ya lo tienes
Webhook Tally firmado (HMAC), formulario → lead con auto-matching por email/teléfono, idempotencia real (UNIQUE + transacción), página de feedback con filtro de quejas.

### Preguntas

- **T1 🟡 — ¿Ruteo automático del lead entrante?** Asignar agente por rubro/regla + tarea de primer contacto (conecta con F4/F6).
- **T2 ◻ — ¿Auto-respuesta al que llena el formulario?** (email de agradecimiento por Resend)
- **T3 ◻ — ¿Formularios nativos?** ¿O seguir 100% con Tally?

## 9. Notificaciones, digest y seguimientos 🟡

### Ya lo tienes
Campana con polling (60s) y lectura optimista, followups de hoy (conversaciones activas + tareas + pagos), digest diario por email a la hora configurable del tenant, recordatorios de pago, widget de salud de integraciones.

### Preguntas

- **N1 🟡 — ¿Digest por agente?** Hoy es uno por tenant (email interno). ¿Cada agente su "tus followups de hoy"?
- **N2 🟡 — ¿Alertas de leads sin respuesta?** Lead/contacto sin contestar en X horas → notificación en campana (hoy el widget de integraciones es lo más cercano).
- **N3 ◻ — ¿Canales extra?** Slack/Discord/Telegram para alertas críticas (pagos vencidos, campaña fallida).
- **N4 ◻ — ¿Prioridades en notificaciones?** Hoy la campana mezcla todo; ¿separar "me asignaron" de "sistema"?

## 10. IA ◻ (ya funciona más de lo que se ve)

### Ya lo tienes
Resúmenes automáticos de conversaciones (Groq/OpenRouter, key por tenant, sweep cada hora) con sentimiento, objeciones y próximos pasos en la ficha; tab de IA en el drawer de lead (análisis a demanda); agente MCP externo con permisos granulares. *(El copiloto interno fue eliminado — `copilot-actions.ts` es código muerto.)*

### Preguntas

- **I1 🟡 — ¿Sugerencias de respuesta en el inbox?** (borrador de respuesta con el contexto del resumen — el modelo ya está pagado)
- **I2 ◻ — ¿Clasificación automática de leads nuevos?** Rubro estimado, prioridad, resumen al crear.
- **I3 ◻ — ¿Transcripción de notas de voz de WhatsApp?** (entradas comunes en este canal)
- **I4 ◻ — ¿Límite de coste por tenant?** Hoy el sweep corre sin techo de tokens.

## 11. Multi-tenant, roles y seguridad 🔥

### Ya lo tienes
Aislamiento doble (plugin + scoping manual verificado), roles globales admin/agente/viewer, invitación desde la UI, MCP con API keys solo-admin y permisos por colección, 3 webhooks firmados, cron fail-closed, rate limit en webhooks y acciones costosas.

### Preguntas (varias = fixes de la auditoría pendientes)

- **R1 🔥 — ¿Roles por tenant o globales?** Hoy globales: un admin lo es de TODOS los tenants (y la invitación hoy permite crear admins globales — hueco a cerrar). Si el modelo es agencia con clientes, probablemente quieras `admin` por tenant + un solo superadmin tuyo.
- **R2 🔥 — ¿Permisos por módulo?** Ej: un agente que solo ve inbox, o solo facturación. Hoy `canEdit` es todo-o-nada.
- **R3 🟡 — ¿Bitácora de auditoría?** Quién cambió qué (importe en facturación, borrados). Hoy solo `activities` de CRM.
- **R4 🟡 — ¿2FA para admins?** Cuentas con acceso a datos de clientes y claves de IA.
- **R5 ◻ — ¿Exportación/backup por tenant?** Al borrar un tenant el plugin hace cascade — ¿quieres export previo obligatorio?
- **R6 ◻ — ¿SSO (Google)?** Para los usuarios del equipo.

## 12. UI/UX general 🟡

### Ya lo tienes
23 rutas 100% funcionales sobre datos reales, cockpit bento personalizable, ⌘K, inbox estilo Chatwoot, kanbans con rollback optimista, billing de 5 tabs, dark-by-design, responsive, empty states, loading/error/not-found. *(Faltantes detectados: errores de formulario caen a error boundary, 10+ listados sin paginación, sin toasts, timezone hardcodeada en calendario, admin de Payload sin customizar.)*

### Preguntas

- **U1 🔥 — ¿Idioma?** Todo en español hardcodeado. ¿Es/en algún día? (decide si el copy se externaliza YA, barato ahora, caro después)
- **U2 🟡 — ¿Quién usa esto?** ¿Solo tu equipo interno o agentes de cada cliente-empresa? Cambia: onboarding, help texts, simplicidad del admin, i18n.
- **U3 ◻ — ¿PWA/mobile?** Hoy responsive en navegador; ¿instalable, notificaciones push?
- **U4 ◻ — ¿Onboarding de tenant nuevo?** ¿Checklist guiado (conectar WhatsApp, Gmail, dominio de envío, invitar equipo, crear rubros)? Hoy un tenant nuevo arranca vacío y sin guía.
- **U5 ◻ — ¿Modo claro?** Hoy dark-by-design sin toggle; irrelevante si es uso interno, relevante si lo usan clientes.

## 13. Infraestructura y operación ◻

### Ya lo tienes
Vercel + Neon (pool afinado, SSL opcional), S3 para archivos, migraciones versionadas, cron por GitHub Actions cada 5 min con `CRON_SECRET`, tests de integración y e2e (vitest + Playwright).

### Preguntas

- **X1 🟡 — ¿Observabilidad?** Hoy solo logs. ¿Sentry (errores), Better Stack/otro (uptime de crons)? El digest puede fallar en silencio.
- **X2 ◻ — ¿Staging?** Branch de Neon + preview de Vercel para probar campañas/webhooks sin tocar prod.
- **X3 ◻ — ¿Crons a Vercel nativo?** Hoy GH Actions; vercel.json lo soporta y elimina un punto de fallo externo.
- **X4 ◻ — ¿Cuántos tenants esperas en 6 meses?** Dimensiona pool de Neon, plan de Resend, y si el modelo "1 buzón/1 número" aguanta.

---

## Resumen: las 12 decisiones que condicionan todo lo demás

1. **W1/W3** — Números de WhatsApp y broadcast: ¿agencia con número propio o clientes con su WABA?
2. **W2** — Ventana 24h: la UX de plantillas fuera de ventana (el código ya está medio hecho).
3. **E1/E3** — Email por tenant: buzón propio y dominio de envío propio por cliente (modelo producto) vs centralizado (modelo agencia).
4. **E5** — Enviar 1-a-1 desde Gmail y campañas desde Resend (híbrido recomendado).
5. **C3** — Desuscripción legal antes de escalar campañas.
6. **C4** — Segmentos = rubro simple o reglas dinámicas.
7. **B1/B2** — Facturación: control interno o valor fiscal/cobro en línea.
8. **F1** — Pipeline fijo o configurable por tenant.
9. **A1** — Agenda bidireccional con Google Calendar.
10. **R1/R2** — Roles por tenant y permisos por módulo.
11. **U1/U2** — Idioma y audiencia (interno vs producto multi-cliente).
12. **X4** — Tamaño objetivo (tenants, volumen): el norte de todo lo anterior.

---

## 14. Bloque de roadmap (cierra el grill)

- **RM1 — ¿Qué es martes-hub?** a) herramienta interna de tu agencia b) producto para vender a otras empresas c) mixto (interno primero, vender después)
- **RM2 — Los 3 módulos que más te duelen hoy:** ___
- **RM3 — La feature que más te ilusiona para el próximo mes:** ___
- **RM4 — ¿Cuánto tiempo/semana (o presupuesto dev) hay para desarrollar?** ___
- **RM5 — ¿Hay fecha o evento que ordene las prioridades** (lanzar a clientes, campaña de temporada, cierre de mes)? ___
- **RM6 — Reparte 100%:** fixes/estabilidad __% · features nuevas __% · pulido UI/UX __%
