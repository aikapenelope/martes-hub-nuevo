# Martes Hub

CRM integral (una empresa, sus clientes hoy; SaaS-ready): mensajería WhatsApp/Instagram, seguimiento proactivo, cobros, membresías, planificación de publicaciones en redes con métricas, formularios, citas y pipeline de ventas conversacional. La IA es una sola acción puntual dentro del CRM (resumen de conversaciones) — cualquier análisis o automatización más abierta (incluida la publicación real en redes sociales) se hace conectando un agente MCP externo (el modelo/cliente que prefieras) a `/api/mcp`.

**Estado actual:** backend y modelo de F0–F9 implementados; workspace operativo (`/workspace/*`) con datos reales — CRM (tabla + pipeline Kanban), tareas, inbox, hoy, billing, analytics, social. CI real en GitLab (typecheck + lint + build + tests de integración contra Postgres) está verde. Drawer 360° del pipeline con copiloto IA (resumen puntual), email y chat WhatsApp/Instagram funcionando de punta a punta. F7 Social ya no depende de construir la Graph API de Meta nosotros mismos: este sistema planifica el contenido (Kanban, calendario, copy, imágenes) y la publicación real la hace un agente MCP conectado además al MCP oficial de Metricool o Composio — ver nota en la tabla de decisiones. Siguen pendientes las credenciales reales de OpenBSP, Resend y Tally (las provee el dueño del negocio, no requieren más código).

| Fase | Estado |
|---|---|
| F0 Fundaciones (scaffold + Neon + Vercel + migraciones en build) | ✅ |
| F1 CRM core (colecciones, RBAC, timeline, kanban, CSV) | ✅ |
| F1b Multi-tenant SaaS-ready (plugin oficial, isolation endurecido, S3 storage) | ✅ |
| F2 Dinero (payments/memberships, recordatorios, digest multi-tenant) | ✅ |
| F3 WhatsApp/IG completo (modelo + webhook + inbox + plantillas + errores + contactos) | ✅ |
| F4 Seguimiento proactivo determinista (lista "Hoy" + click-to-chat) · agente reactivo vive en OpenBSP | ✅ código — ⏳ requiere conexión real del número y agente |
| F5 Email (Resend: adaptador oficial + campaigns async con Jobs Queue + log + webhooks) | ✅ código — ⏳ requiere credenciales Resend |
| F6 Leads por Apify | ❌ descartada — import manual CSV/JSON con plugin oficial |
| F6b Facturación y cotizaciones (`payload-invoicepdf` + `offers` + aislamiento multi-tenant) | ✅ |
| **Martes Workspace** (`/workspace/*`: overview, CRM, tasks, inbox, hoy, social, billing, analytics) | ✅ datos reales, seguridad por operación, UI funcional — ver pendientes en "Qué falta" |
| **Pipeline de Ventas Conversacional 360°** (Kanban + drawer omnicanal + copiloto IA + emailing) | ✅ — auto-creación de leads desde OpenBSP, drag-and-drop, chat/email/IA/timeline/datos por lead |
| **F8 Formularios y ciclo de vida** (Tally webhook firmado + `form-submissions` + matching lead/cliente + alertas) | ✅ |
| **F9 MCP + Task manager** (`@payloadcms/plugin-mcp` + `tasks` kanban + `conversation-summaries`) | 🟡 copiloto IA in-app (solo resumen puntual) ✅ — MCP externo (`/api/mcp`) ahora con create/update en `conversation-summaries`/`social-posts`/`post-metrics`/`media` además de `clients`/`leads`/`tasks`: endurecer por rol/tenant antes de repartir API keys ⬜ |
| F7 Social (planificación + publicación vía agente MCP) | ✅ planificación (Kanban, calendario, copy, imágenes) — publicación real delegada a un agente MCP conectado a Metricool/Composio, fuera de este repo |
| F10 Hardening (CI real + suite de pruebas + rate limiting + seguridad PITR) | 🟡 CI GitLab + tests de integración con Postgres real ✅ · rate limiting en Server Actions de IA/email/WhatsApp ✅ · e2e Playwright en CI ✅ · MCP externo y backups PITR ⬜ |

**Cómo vamos:** infraestructura, CRM, facturación, seguimiento diario, jobs, formularios, pipeline conversacional 360°, colecciones de tareas y CI real están implementados y verificados contra Postgres real en cada merge request. El MCP externo (para clientes MCP de terceros) tiene ahora más superficie de escritura (`clients`/`leads`/`tasks`/`conversation-summaries`/`social-posts`/`post-metrics`/`media`) y debe endurecerse por operación/rol/tenant antes de entregar una API key a nadie fuera del equipo. El workspace es la aplicación diaria integrada; `/admin` sigue como backoffice técnico.

---

## Stack

| Capa | Tecnología |
|---|---|
| Aplicación | Payload 3.x (framework fullstack Next.js) · TypeScript estricto |
| Base de datos | Neon Postgres (adapter `@payloadcms/db-postgres`, connection string *pooled*, SSL) + `pgvector` |
| Hosting | Vercel (serverless) + scheduler externo gratuito para crons sub-diarios (fase inicial) |
| Mensajería | OpenBSP (`matiasbattocchia/open-bsp-api`) sobre Meta Cloud API: WhatsApp + Instagram DM |
| Email | Resend vía adaptador oficial `@payloadcms/email-resend` (API HTTP, no SMTP) |
| Ingesta de leads | Apify (actors → webhook → colección `leads`) |
| Formularios | Tally (webhooks firmados → `form-submissions`) |
| Citas | Google Calendar API v3 (solo lectura; el agente de OpenBSP crea las citas) |
| Publicación social | Este sistema solo planifica (Kanban, calendario, copy, imágenes en `social-posts`/`media`); la publicación real la hace un agente conectado por MCP a `/api/mcp` (este sistema) + al MCP oficial de Metricool o Composio (gestionan OAuth/tokens de Meta/TikTok/etc.) |
| Agente IA / MCP | Protocolo MCP nativo vía `@payloadcms/plugin-mcp` (expone clientes, leads, tareas, resúmenes, publicaciones sociales y métricas) · Copiloto IA in-app: una sola acción puntual (resumen de conversación) vía Vercel AI SDK · Reactivo (entrantes): agente nativo de OpenBSP |

## Configuración regional

- Moneda: **USD**
- Zona horaria: **America/Caracas (UTC-4)** — aplica a crons, calendario editorial y digestios.
- Idioma del admin/producto: español.

## Decisiones técnicas cerradas (con alternativas descartadas)

| Decisión | Elegido | Descartado / motivo |
|---|---|---|
| Multi-tenancy | Plugin oficial `@payloadcms/plugin-multi-tenant` desde F1: colección `tenants`, campo tenant en todas las colecciones de negocio, `company-settings` como global por empresa (`isGlobal`). Producto opera **mono-tenant** (tenant "Martes") pero el esquema queda SaaS-ready | Retrofit posterior (migrar datos vivos + rehacer access control en cada colección, job y webhook). DB-per-tenant en Neon descartado: sobrecosto operativo para muchas pymes |
| Publicación social | **Decisión revisada:** delegar la publicación real a un agente conectado por MCP a `/api/mcp` (este sistema) + al MCP oficial de Metricool o Composio, en vez de construir el conector con la Graph API de Meta nosotros mismos. Este sistema solo planifica el contenido (`social-posts`, Kanban, calendario, `media`, `post-metrics`) y lo expone por MCP con create/update; el agente externo lee de ahí, publica de verdad con su propia conexión a Metricool/Composio (que resuelven OAuth, refresco de tokens y rate limits de forma oficial), y escribe el resultado de vuelta. **Sigue confirmado:** ninguna vía evita que Instagram/Facebook dependan en algún punto de la Graph API de Meta — lo que cambia es que ya no la mantenemos nosotros | Construir y mantener el conector de la Graph API de Meta a mano (OAuth propio, expiración de tokens, cambios de versión de API) — descartado por sobrecarga operativa frente a delegar en un MCP ya oficial y mantenido por terceros (Metricool/Composio) |
| Orquestación interna | Payload Jobs Queue + cron externo | n8n / ActivePieces (duplican lógica y webhooks; se pueden añadir después sin rediseño) |
| IA en background | Fuera de martes-hub: el agente reactivo vive en OpenBSP (dispara en cada entrante, LLM propio o AI credits). El proactivo es una lista determinista sin IA. Dentro del CRM la única llamada directa a un LLM es el resumen puntual de conversación (copiloto del drawer); cualquier análisis más abierto se conecta por MCP · pgvector para búsqueda semántica | Un chat de IA de uso general propio (redundante con conectar cualquier cliente MCP externo); jobs propios llamando LLM (más código que mantener y rígido); "IA en Neon" (Neon es Postgres puro, no tiene IA nativa) |
| MCP hacia agentes externos | `@payloadcms/plugin-mcp` (oficial, sincronizado con core) | `payload-plugin-mcp` de Antler Digital (buena alternativa si falta algo) |
| Observabilidad | Logs/métricas nativas Vercel + Neon | Sentry (opcional futuro; sistema privado) |
| Task manager | Colección `tasks` propia + vista kanban (plugin `payload-kanban-board` interconectado al CRM) | Ningún equivalente ClickUp existe sobre Payload; la ventaja es la interconexión nativa con todo el CRM |
| Import/Export de datos | Plugin oficial `@payloadcms/plugin-import-export` (UI en admin, CSV/JSON, preview, upsert) sobre leads/clients/payments | Endpoint casero `importCsv` queda como respaldo hasta validar el plugin con multi-tenant; community plugins de import/export descartados (menor mantenimiento) |
| Facturas y cotizaciones | Plugin `payload-invoicepdf`: colecciones invoices/quotes, PDF vía `@react-pdf/renderer` (serverless sin Chrome), autofill desde `clients`/`offers`, envío por email con adjunto (Resend), link de aceptación de cotizaciones. **Solo documento comercial interno — sin cumplimiento fiscal SENIAT** | Construir facturación propia sobre pdfkit (más código, mismo resultado); e-factura fiscal (no requerido) |
| Scraping de leads (Apify / F6) | Fase descartada: import manual de datasets CSV/JSON cubre el volumen actual. Opción futura documentada: un agente conectado por MCP corre actores vía el MCP oficial de Apify (`mcp.apify.com`) cuando exista | Webhook automático actor→CRM (over-engineering para el volumen actual) |

## Modelo de datos (colecciones)

| Colección | Propósito |
|---|---|
| `users` | Auth + roles: admin / agente / viewer (RBAC por colección y campo) |
| `clients` | Cliente: datos, etapa de ciclo de vida, agente asignado, consentimiento/opt-out |
| `leads` | Prospects crudos (fuente: Apify, Tally, manual, DM, auto-creados por mensaje entrante de OpenBSP) con pipeline, rubro, valor estimado y agente asignado |
| `activities` | Log unificado de interacciones |
| `conversations` / `messages` | Hilos por canal (whatsapp / instagram_dm / email) y mensajes con estado Meta |
| `message-templates` | Plantillas WhatsApp aprobadas + respuestas rápidas |
| `conversation-summaries` | Resumen IA por cliente (sentimiento, objeciones, próximos pasos) |
| `payments` | Tracking USD: monto, vencimiento, estado, método |
| `memberships` | Ciclo de membresía: inicio, renovación, estado |
| `appointments` | Citas sincronizadas de Google Calendar |
| `offers` | Catálogo de productos/servicios (alimenta cotizaciones, facturas y sugerencias del agente) |
| `invoices` / `quotes` / `shop-info` (plugin invoicepdf) | Facturación comercial interna: line items, IVA, numeración automática, PDFs versionados en Media, envío por email y aceptación de cotizaciones por link |
| `social-accounts` | Referencia de cuentas IG/FB/TikTok/etc. conectadas en Metricool/Composio — sin credenciales propias, solo nombre/plataforma/estado |
| `social-posts` / `post-metrics` | Contenido: draft→scheduled→published/failed; métricas diarias (views, reach, likes…) |
| `scrape-runs` | Ejecuciones Apify (actor, run ID, dataset, estado) |
| `form-submissions` | Entradas Tally: queja / comentario / sugerencia / NPS |
| `tasks` | Task manager interno con vista kanban: estado, prioridad, checklist, cliente/lead asignado |
| `documents` | Contratos/facturas PDF por cliente (uploads) |
| `segments` | Segmentos/tags (p. ej. rubro del lead) |
| `notifications` | Centro de notificaciones internas |
| `company-settings` (global por tenant) | Empresa, horarios, políticas de recordatorio, textos, zona horaria |

### Para ofrecer como servicio (SaaS) — pendiente, NO bloquea F2+
El esquema ya es multi-tenant; lo que falta es producto/comercial y se decide más adelante:
- Onboarding/self-signup de nuevas empresas
- Credenciales por tenant (dominio Resend verificado, OAuth GCal, cuenta propia de Metricool/Composio) → fases F3–F7 se construyen tenant-aware desde el inicio
- Billing: suscripciones, límites de uso
- Roles diferenciados por membresía (hoy: rol global del usuario + aislamiento por pertenencia al tenant)

## Automatizaciones (Jobs Queue)

| Job | Frecuencia | Función |
|---|---|---|
| `sync-gcal` | 15 min | Sincroniza citas de Google Calendar |
| `payment-reminders` | diario 08:00 UTC-4 | Cobros por vencer/vencidos → WhatsApp plantilla + email |
| `daily-digest` | diario 08:00 UTC-4 | Resumen interno: citas del día, pagos, leads nuevos, tareas vencidas |
| `weekly-report` | lunes 08:00 | Reporte generado vía MCP por el agente que conectes |

> La publicación y las métricas de redes sociales ya no son jobs internos: las ejecuta un agente conectado por MCP a este sistema + al MCP de Metricool/Composio (ver tabla de decisiones).

## Integraciones y credenciales requeridas

| Servicio | Credencial | Notas |
|---|---|---|
| Neon | `DATABASE_URL` (pooled, SSL) + `DATABASE_URL_DIRECT` (sin pooler, para `pnpm migrate`) | Proyecto nuevo; activar pgvector. Neon recomienda no correr migraciones por el pooler (rompe estado de sesión) — `scripts/migrate.mjs` ya usa `DATABASE_URL_DIRECT` si está presente |
| Cloudflare R2 (opcional, storage de media/documentos) | `S3_BUCKET` + `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY` + `S3_ENDPOINT` | Vía `@payloadcms/storage-s3` (compatible S3); sin `S3_BUCKET` los archivos se guardan localmente. `S3_REGION=auto` y `forcePathStyle: true` ya configurados para R2 |
| OpenBSP | Org + `api-key` (+ `apikey` pública Supabase) | Webhook con `callback_url` + `verify_token`; envío por REST |
| Resend | `RESEND_API_KEY` + `RESEND_WEBHOOK_SECRET` | Verificar dominio de envío; webhook de bounce/complaint en dashboard Resend → `/api/webhooks/resend` |
| Apify | `APIFY_TOKEN` | Webhook de fin de actor → `/api/webhooks/apify` |
| Tally | Webhook firmado por formulario | HMAC compartido en env |
| Google Calendar | OAuth client JSON | Solo lectura del calendario de citas |
| LLM del agente reactivo | API key del proveedor elegido (opcional) | Se configura en el dashboard de OpenBSP (`AgentExtra.api_key`); sin ella consume los AI credits hosted ($1 incluidos) |
| Metricool o Composio (opcional, para publicar en redes) | Cuenta propia en cualquiera de los dos + su MCP conectado en el cliente del agente | No vive en este repo: el agente que conectes a `/api/mcp` de este sistema conecta también su propio MCP de Metricool/Composio y hace la publicación real |
| Upstash Redis (opcional, rate limiting distribuido) | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | Sin esto, el rate limiting de webhooks y de las Server Actions de IA/email/WhatsApp cae a memoria local por-instancia (no compartida entre lambdas de Vercel) |
| Scheduler externo | cuenta gratuita (cron-job.org / Upstash QStash) | Llama endpoint runner mientras no haya Vercel Pro |

## Sprints

> Convención: cada sprint termina verificable ("Done when"). Tras este README inicial,
> **todo entra por PR**: ninguna rama se mergea directo a `main`.

### F0 — Fundaciones
- Objetivo: repo vivo, deployable, documentado.
- Tareas: scaffold Payload 3 + Next.js (`pnpm dlx create-payload-app@latest`), adapter Postgres apuntando a Neon, deploy base en Vercel, `.gitignore`, CI básico (typecheck+lint).
- Done when: `vercel` sirve el admin en preview desde un PR; typecheck/lint verdes en CI.

### F1 — CRM core
- Objetivo: clientes, leads y actividades gestionables en el admin.
- Tareas: colecciones `users`(roles)/`clients`/`leads`/`activities`/`segments`/`documents`/`company-settings`; RBAC campo a campo; vista kanban del pipeline; import/export CSV.
- Done when: alta de cliente → timeline visible; roles restringen acciones reales.

### F2 — Dinero: pagos y membresías
- Objetivo: tracking completo de cobros y ciclo de membresía.
- Tareas: `payments`/`memberships` (USD), job `payment-reminders` (email primero), `daily-digest`.
- Done when: pago vence mañana → llega recordatorio hoy; digest diario correcto en UTC-4.

### F3 — WhatsApp e Instagram DM (OpenBSP)
- Objetivo: canal bidireccional con inbox unificado.
- Tareas: registro de webhook OpenBSP (`verify_token`, firma Meta), ingesta a `conversations`/`messages`, envío REST desde inbox, `message-templates`, opt-out.
- Done when: mensaje entrante aparece <5s en inbox; respuesta humana sale y queda registrada.

### F4 — Seguimiento proactivo + agente reactivo (OpenBSP hosted)
- Objetivo: saber a quién escribirle cada día sin pagar conversaciones business-initiated, y que las conversaciones se atiendan solas.
- Principio: OpenBSP es dueño del canal y del agente; martes-hub solo jala información (webhook), envía por API y calcula listas deterministas. Sin IA interna — la única IA dentro del CRM es el resumen puntual de conversación del pipeline (F9).
- Estrategia de contacto:
  - **Primer mensaje lo escribe el humano** desde su WhatsApp vía link click-to-chat (`wa.me/<tel>?text=<borrador>`) en la lista "Hoy" del admin → conversación user-initiated, sin costo de plantilla Meta.
  - **Cuando el lead responde, el agente de OpenBSP continúa solo** (ventana 24h abierta). El webhook F3 ya espeja entrantes Y salientes (incluidos los del agente) a `conversations`/`messages`.
  - Opción futura (no bloquea): disparar al agente proactivamente vía API/MCP de OpenBSP → requiere plantilla business-initiated (costo Meta); se evalúa con datos reales.
- Tareas:
  - Prioridad de seguimiento **calculada en vivo** (sin job ni cron): endpoint `GET /api/followups/hoy` rankea con reglas aritméticas fijas — días desde el último contacto, etapa del lead, si respondió (aritmética pura, sin IA ni LLM). Si el lead respondió hace menos de 24h sale solo de la lista: stop-on-reply estructural.
  - Vista admin **"Hoy"**: lista ordenada de seguimientos pendientes con nombre, etapa, motivo ("3 días sin respuesta"), score y botón WhatsApp click-to-chat con borrador de mensaje; marca seguimiento hecho al detectar respuesta entrante.
  - Verificaciones E2E al conectar el número real: (1) los mensajes salientes del agente OpenBSP llegan por webhook y se espejan como `outbound`; (2) el registro del webhook soporta el header `Authorization: Bearer OPENBSP_WEBHOOK_TOKEN` — si la tabla `webhooks` no permite headers, mover el token a query param firmado; (3) `listTemplates()` contra `/rest/v1/templates` devuelve filas — si no, migrar a `/functions/v1/whatsapp-management/templates`.
  - Configuración del agente reactivo (usuario, en dashboard OpenBSP): elegir LLM (BYO API key para no gastar AI credits), prompt base, alcance de conversaciones.
- Eliminado respecto al diseño original: colección `sequences`, jobs `lead-follow-up`/`generate-summary` propios, plugin MCP en F4.
- Done when: la lista "Hoy" muestra los leads correctos con su link; el usuario abre conversación manualmente, el lead responde y el agente de OpenBSP le contesta solo, quedando todo espejado en el CRM.

### F5 — Email automatizado (Resend)
- Objetivo: transaccionales + campañas con log y detección de bounces.
- Construido:
  - Adaptador oficial `@payloadcms/email-resend` (API HTTP; reemplaza el SMTP vía nodemailer).
  - Colecciones `email-log` (registro por destinatario, estado actualizado por webhook) y `email-campaigns` (asunto, cuerpo HTML, audiencia por rubro, stats) — tenant-aware.
  - Plantilla base HTML (`src/email/layout.ts`) con preheader y footer de baja.
  - Envío de campaña: `POST /api/email-campaigns/:id/send` — destinatarios = leads + clientes del rubro con email, dedupe, tope 200, cada envío queda en `email-log`.
  - Webhook Resend `/api/webhooks/resend` (firma Svix): delivered/bounced/complained/failed actualizan el `email-log`.
- Pendiente (usuario): cuenta Resend + dominio verificado + `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` y registro del webhook en su dashboard.
- Done when: campaña de prueba enviada y loggeada; bounce registrado por webhook.

### F6 — Facturación y cotizaciones (antes: Leads por Apify, descartada)
- Objetivo: cotizar y facturar sin salir del CRM (documento comercial interno, no fiscal).
- Tareas:
  - Plugin `payload-invoicepdf`: colecciones `invoices`/`quotes` + global `shop-info`, PDFs con `@react-pdf/renderer` guardados en `media`.
  - Colección `offers` (catálogo): nombre, precio USD, descripción — alimenta el autofill de line items.
  - Autofill de cliente desde `clients`; envío por email con adjunto vía Resend; link público tokenizado para aceptar/rechazar cotizaciones → genera factura borrador.
  - Config: moneda `$` USD · IVA por defecto 16% · términos 30 días · prefijos INV/COT.
- Done when: cotización creada desde un offer se descarga en PDF y su aceptación genera factura borrador.

### Dashboard de inicio (nueva fase — sin número de sprint)
- Objetivo: abrir el admin y ver el día de un vistazo, sin navegar colecciones.
- Tareas:
  - Vista custom `/admin/dashboard` (mismo patrón que Hoy/Inbox) como página de aterrizaje.
  - Widgets v1: **Hoy** (reutiliza `/api/followups/hoy` con botón WhatsApp), **Cobros** (vencidos + por vencer esta semana), **Conversaciones sin responder** (>4h desde último entrante), **Notificaciones** recientes, **Números rápidos** (leads nuevos esta semana, ingresos del mes, cotizaciones abiertas).
  - Widgets v2 (cuando existan): citas del día (GCal), tareas vencidas (F9), campañas activas.
- Done when: el dueño abre el admin y en una pantalla decide qué hacer hoy.

### F7 — Publicaciones sociales + métricas
- Objetivo: calendario editorial de contenido, con publicación y métricas resueltas fuera de este repo.
- Decisión (revisada): no se construye un conector propio a la Graph API de Meta. Este sistema es la fuente de verdad del contenido — `social-posts` (copy, imágenes vía `media`, cuenta destino, estado draft→scheduled→published/failed) y `post-metrics` — expuesta por `/api/mcp` con create/update. Un agente MCP externo (el cliente/modelo que conectes) lee el contenido listo desde aquí, publica de verdad usando su propia conexión al MCP oficial de Metricool o Composio (ambos resuelven OAuth/tokens de Meta, TikTok, LinkedIn, etc. de forma oficial), y escribe el resultado (publicado/fallido, enlace público, métricas) de vuelta en `social-posts`/`post-metrics`.
- Construido: colecciones `social-accounts`/`social-posts`/`post-metrics` con su migración, UI de Kanban/calendario en `/workspace/social`, exposición MCP con create/update.
- Pendiente (usuario): conectar un agente MCP a este sistema y, en el mismo agente, al MCP de Metricool o Composio.
- Done when: un agente conectado por MCP crea un post aquí, lo publica de verdad vía Metricool/Composio, y el estado/métricas quedan reflejados en `/workspace/social`.

### F8 — Formularios y ciclo de vida (Tally)
- Objetivo: voz del cliente y transiciones automáticas de etapa.
- Construido:
  - Colección `form-submissions` (tenant-aware, vinculación a `client` y `lead`, respuestas estructuradas en JSON y raw payload).
  - Webhook `/api/webhooks/tally` con verificación criptográfica HMAC SHA256 (`TALLY_SIGNING_SECRET`) y tokens.
  - Auto-matching por email/teléfono a clientes existentes o creación automática de nuevo lead (`source: 'tally'`).
  - Detección de quejas / bajo NPS (≤6) con disparo automático de notificaciones de advertencia y creación de tareas urgentes.
- Done when: envío desde Tally crea `form-submissions`, asocia cliente/lead y alerta quejas en `notifications` (✅ PR #22).

### F9 — MCP + Task manager
- Objetivo: acceso externo por MCP y gestión de tareas interconectada; la IA interna se limita a una acción puntual.
- Construido:
  - Integración oficial de `@payloadcms/plugin-mcp` registrada para clientes, leads, tareas, resúmenes, pagos, publicaciones sociales y métricas — expuesta en `/api/mcp` para clientes MCP externos (Claude Desktop, Cursor, o cualquier agente que conectes). Sigue pendiente restringir operaciones/rol/tenant antes de entregar una API key fuera del equipo (ver "Qué falta").
  - Copiloto IA in-app: una sola acción puntual (botón "Generar resumen IA" del drawer del lead, vía Anthropic/OpenAI), no un chat de uso general — cualquier análisis más abierto se hace conectando un cliente MCP externo.
  - Colección `tasks` (título, descripción, estados kanban, prioridad, checklist, fechas límite, cliente y lead vinculados).
  - Colección `conversation-summaries` (resúmenes ejecutivos, sentimiento, objeciones y próximos pasos) — generable desde el copiloto IA del drawer del lead o por un agente MCP externo.
  - Creación automática de tareas ante quejas en formularios (`tally_complaint`).
- Done when: herramientas MCP operativas en el backend, tareas gestionables vía vista kanban y copiloto IA generando resúmenes desde el pipeline (✅).

### F10 — Hardening
- Objetivo: producción confiable.
- Tareas: revisión seguridad (webhooks firmados, secrets, tokens cifrados), tests de webhooks y jobs, manejo de rate limits/reintentos, backups PITR Neon, CI real.
- Construido:
  - CI real en GitLab (`.gitlab-ci.yml`): typecheck + lint + build + tests de integración contra un Postgres de servicio, más un job de e2e (Playwright) con navegador headless.
  - Rate limiting por usuario en las Server Actions de costo variable del pipeline (resumen de IA, envío de email, respuesta WhatsApp) — mismo mecanismo (Upstash Redis con fallback en memoria) que ya protegía los webhooks públicos.
- Pendiente: endurecer MCP externo (ver "Qué falta"), backups PITR verificados por el dueño.
- Done when: suite de webhooks e integración verde en CI con Postgres real (✅); auditoría de seguridad sin hallazgos High/Critical abiertos salvo el MCP externo (pendiente).

## Qué falta para estar LISTO (v1 operativa)

> Criterio de "listo": el dueño corre su negocio desde el CRM sin herramientas externas.

1. **Conectar OpenBSP real** (modo hosted, sin infraestructura propia): org + número + API keys + agente LLM en el dashboard de OpenBSP → E2E: lead contactado desde el pipeline responde y el agente continúa. El código ya asume hosted-only (REST + webhook, cero acceso a su Supabase); solo faltan las credenciales.
2. **Activar Resend**: dominio verificado + `RESEND_API_KEY` + `RESEND_WEBHOOK_SECRET` → E2E: campaña y email directo desde el drawer del lead enviados, registrados y bounce detectado.
3. **Configurar Webhook Tally**: apuntar a `https://tu-dominio/api/webhooks/tally` y configurar `TALLY_SIGNING_SECRET`.
4. **Endurecer el MCP externo** (`@payloadcms/plugin-mcp`, expuesto en `/api/mcp` para cualquier cliente MCP que conectes — Claude Desktop, Cursor, un agente propio): `clients`, `leads`, `tasks`, `conversation-summaries`, `social-posts`, `post-metrics` y `media` tienen `enabled: true` o create/update abiertos. Antes de entregar una API key de este endpoint a alguien fuera del equipo, restringir por operación/rol/tenant, igual que ya se hizo con `payments`/`invoices`/`quotes`.
5. **Backups PITR de Neon**: verificar que estén activos y probar un restore real — no se puede confirmar desde el código.
6. **Actualizar `sharp`** de `0.34.2` a `>=0.35.0`: vulnerabilidad alta (CVEs heredados de libvips) en la dependencia que procesa las imágenes subidas por usuarios (`pnpm audit`). Cambio de versión simple, sin riesgo de breaking changes conocido.
7. **Configurar `DATABASE_URL_DIRECT` en Vercel**: copiar la connection string directa de Neon (sin `-pooler`, sin `pgbouncer=true`) y ponerla como esa variable — el código ya la usa para migraciones si existe (`scripts/migrate.mjs`), solo falta configurarla. Sin ella, `pnpm migrate` corre por el pooler, que Neon mismo desrecomienda para migraciones.

No bloquean v1: multi-tenant real (SaaS). F7 Social ya no bloquea nada de código — solo falta que conectes un agente MCP a Metricool/Composio cuando quieras publicar de verdad.

## Convenciones de trabajo

- Git: commits convencionales (`type(scope): descripción`); **PRs obligatorios** tras el README inicial — nadie mergea directo a `main` (el merge lo hace el dueño del repo).
- Identidad git: `AngelDelN <57774536+aikapenelope@users.noreply.github.com>`.
- Calidad: todo sprint cierra con typecheck + lint sin errores (y tests donde existan).
- **Antes de CADA push**: correr `pnpm verify` (migrate + build + lint). Es exactamente lo que ejecuta Vercel; `typecheck`/`lint` solos NO bastan — `next build` compila también scripts y vistas cliente y detecta errores que se le escapan a tsc. Los fallos repetidos de deploy de Vercel en agosto 2025 vinieron todos de empujar sin este paso.
- Seguridad: secretos solo en variables de entorno (Vercel/local `.env` nunca commiteado); tokens OAuth cifrados en BD.
- Diagrama del sistema: `docs/diagrams/sistema.excalidraw` (editable en excalidraw.com o VS Code).

## Roadmap opcional (post-F10)

self-host de OpenBSP en Supabase propio · Sentry si crece el equipo · multi-red desde un mismo editor (ya cubierto en la práctica por Metricool/Composio vía MCP, no requiere código nuevo aquí).

> Explícitamente descartado, no solo diferido: construir un conector propio a la Graph API de Meta. La publicación real se delega siempre a un agente MCP conectado a Metricool o Composio — ver tabla de decisiones.
