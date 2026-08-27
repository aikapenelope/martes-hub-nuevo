# Martes Hub

CRM integral (una empresa, sus clientes hoy; SaaS-ready): mensajería WhatsApp/Instagram, seguimiento proactivo, cobros, membresías, publicaciones en redes con métricas, formularios, citas y agente de IA conectado por MCP.

**Estado actual:** backend y modelo de F0–F9 implementados; F7 Social sigue bloqueada por Meta. El workspace operativo (`/overview`, `/crm`, `/tasks`, `/inbox`, `/social`, `/billing`, `/analytics`) tiene arquitectura y scaffold, pero su UI todavía usa datos demo y Hermes aún no tiene una ruta AI real. El próximo desarrollo visual se rige por [`docs/WORKSPACE_ARCHITECTURE.md`](docs/WORKSPACE_ARCHITECTURE.md) y [`docs/WORKSPACE_UI_SPRINT.md`](docs/WORKSPACE_UI_SPRINT.md). Siguen pendientes las credenciales/E2E de OpenBSP, Resend y Tally.

| Fase | Estado |
|---|---|
| F0 Fundaciones (scaffold + Neon + Vercel + migraciones en build) | ✅ |
| F1 CRM core (colecciones, RBAC, timeline, kanban, CSV) | ✅ |
| F1b Multi-tenant SaaS-ready (plugin oficial, isolation endurecido en #21, S3 storage) | ✅ #21 |
| F2 Dinero (payments/memberships, recordatorios, digest multi-tenant) | ✅ |
| F3 WhatsApp/IG completo (modelo + webhook + inbox + plantillas + errores + contactos) | ✅ #10/#11 |
| F4 Seguimiento proactivo determinista (lista "Hoy" + click-to-chat) · agente reactivo vive en OpenBSP | ✅ código (#13) — ⏳ requiere conexión real del número y agente |
| F5 Email (Resend: adaptador oficial + campaigns async con Jobs Queue + log + webhooks) | ✅ código (#14/#21) — ⏳ requiere credenciales Resend |
| F6 Leads por Apify | ❌ descartada — import manual CSV/JSON con plugin oficial (#15); opción futura: Hermes + MCP de Apify en F9 |
| F6b Facturación y cotizaciones (`payload-invoicepdf` + `offers` + aislamiento multi-tenant) | ✅ #16/#21 |
| **Dashboard admin legado** (`/admin/dashboard`) | ✅ #18/#19 — se conserva; no será la UI operativa |
| **Martes Workspace** (`/overview` y módulos separados) | 🟡 arquitectura + scaffold #25; datos reales, seguridad por operación y UI funcional pendientes |
| **F8 Formularios y ciclo de vida** (Tally webhook firmado + `form-submissions` + matching lead/cliente + alertas) | ✅ #22 |
| **F9 Hermes + MCP + Task manager** (`@payloadcms/plugin-mcp` + `tasks` kanban + `conversation-summaries`) | ✅ #23 |
| F7 Social (IG/FB publicaciones + métricas) | ⬜ bloqueada por app Meta |
| F10 Hardening (CI GitHub Actions + suite de pruebas + seguridad PITR) | ⬜ siguiente código |

**Cómo vamos:** infraestructura, CRM, facturación, seguimiento diario, jobs, formularios, colecciones de tareas y plugin MCP están implementados. El MCP debe endurecerse por operación/rol/tenant antes de conectarlo a Hermes; el sidecar del workspace es actualmente una demo. El workspace será la aplicación diaria integrada y `/admin` seguirá como backoffice técnico.

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
| Publicación social | Meta Graph API directa, flujo determinístico (Jobs Queue), OAuth embebido en el admin |
| Agente IA / MCP | Protocolo MCP nativo vía `@payloadcms/plugin-mcp` (expone clientes, leads, tareas, resúmenes) · Reactivo (entrantes): agente nativo de OpenBSP |

## Configuración regional

- Moneda: **USD**
- Zona horaria: **America/Caracas (UTC-4)** — aplica a crons, calendario editorial y digestios.
- Idioma del admin/producto: español.

## Decisiones técnicas cerradas (con alternativas descartadas)

| Decisión | Elegido | Descartado / motivo |
|---|---|---|
| Multi-tenancy | Plugin oficial `@payloadcms/plugin-multi-tenant` desde F1: colección `tenants`, campo tenant en todas las colecciones de negocio, `company-settings` como global por empresa (`isGlobal`). Producto opera **mono-tenant** (tenant "Martes") pero el esquema queda SaaS-ready | Retrofit posterior (migrar datos vivos + rehacer access control en cada colección, job y webhook). DB-per-tenant en Neon descartado: sobrecosto operativo para muchas pymes |
| Publicación social | Meta Graph directo + OAuth embebido (app en Development Mode: cuentas propias, sin App Review) | Metricool API (requiere plan Advanced); Composio (tercero en camino crítico) queda como expansión futura a otras redes |
| Orquestación interna | Payload Jobs Queue + cron externo | n8n / ActivePieces (duplican lógica y webhooks; se pueden añadir después sin rediseño) |
| IA en background | Fuera de martes-hub: el agente reactivo vive en OpenBSP (dispara en cada entrante, LLM propio o AI credits). El proactivo es una lista determinista sin IA. La IA interna propia (resúmenes, reportes) llega con Hermes vía MCP en F9 · pgvector para búsqueda semántica | Jobs propios llamando LLM (más código que mantener y rígido); "IA en Neon" (Neon es Postgres puro, no tiene IA nativa) |
| MCP hacia Hermes | `@payloadcms/plugin-mcp` (oficial, sincronizado con core) | `payload-plugin-mcp` de Antler Digital (buena alternativa si falta algo) |
| Observabilidad | Logs/métricas nativas Vercel + Neon | Sentry (opcional futuro; sistema privado) |
| Task manager | Colección `tasks` propia + vista kanban (plugin `payload-kanban-board` interconectado al CRM) | Ningún equivalente ClickUp existe sobre Payload; la ventaja es la interconexión nativa con todo el CRM |
| Import/Export de datos | Plugin oficial `@payloadcms/plugin-import-export` (UI en admin, CSV/JSON, preview, upsert) sobre leads/clients/payments | Endpoint casero `importCsv` queda como respaldo hasta validar el plugin con multi-tenant; community plugins de import/export descartados (menor mantenimiento) |
| Facturas y cotizaciones | Plugin `payload-invoicepdf`: colecciones invoices/quotes, PDF vía `@react-pdf/renderer` (serverless sin Chrome), autofill desde `clients`/`offers`, envío por email con adjunto (Resend), link de aceptación de cotizaciones. **Solo documento comercial interno — sin cumplimiento fiscal SENIAT** | Construir facturación propia sobre pdfkit (más código, mismo resultado); e-factura fiscal (no requerido) |
| Scraping de leads (Apify / F6) | Fase descartada: import manual de datasets CSV/JSON cubre el volumen actual. Opción futura documentada: Hermes corre actores vía MCP oficial de Apify (`mcp.apify.com`) cuando exista (F9) | Webhook automático actor→CRM (over-engineering para el volumen actual) |

## Modelo de datos (colecciones)

| Colección | Propósito |
|---|---|
| `users` | Auth + roles: admin / agente / viewer (RBAC por colección y campo) |
| `clients` | Cliente: datos, etapa de ciclo de vida, agente asignado, consentimiento/opt-out |
| `leads` | Prospects crudos (fuente: Apify, Tally, manual, DM) con pipeline y rubro |
| `activities` | Log unificado de interacciones |
| `conversations` / `messages` | Hilos por canal (whatsapp / instagram_dm / email) y mensajes con estado Meta |
| `message-templates` | Plantillas WhatsApp aprobadas + respuestas rápidas |
| `conversation-summaries` | Resumen IA por cliente (sentimiento, objeciones, próximos pasos) |
| `payments` | Tracking USD: monto, vencimiento, estado, método |
| `memberships` | Ciclo de membresía: inicio, renovación, estado |
| `appointments` | Citas sincronizadas de Google Calendar |
| `offers` | Catálogo de productos/servicios (alimenta cotizaciones, facturas y sugerencias del agente) |
| `invoices` / `quotes` / `shop-info` (plugin invoicepdf) | Facturación comercial interna: line items, IVA, numeración automática, PDFs versionados en Media, envío por email y aceptación de cotizaciones por link |
| `social-accounts` | Cuentas IG/FB (tokens cifrados, expiración) |
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
- Credenciales por tenant (app Meta propia, dominio Resend verificado, OAuth GCal) → fases F3–F7 se construyen tenant-aware desde el inicio
- Billing: suscripciones, límites de uso
- Roles diferenciados por membresía (hoy: rol global del usuario + aislamiento por pertenencia al tenant)

## Automatizaciones (Jobs Queue)

| Job | Frecuencia | Función |
|---|---|---|
| `publish-scheduled-posts` | 5 min | Publica `social-posts` vencidos vía Graph API |
| `sync-gcal` | 15 min | Sincroniza citas de Google Calendar |
| `payment-reminders` | diario 08:00 UTC-4 | Cobros por vencer/vencidos → WhatsApp plantilla + email |
| `fetch-social-metrics` | diario | Métricas IG/FB → `post-metrics` |
| `refresh-tokens` | diario | Renueva long-lived tokens Meta (~55 días) |
| `daily-digest` | diario 08:00 UTC-4 | Resumen interno: citas del día, pagos, leads nuevos, tareas vencidas |
| `weekly-report` | lunes 08:00 | Reporte generado por Hermes vía MCP |

## Integraciones y credenciales requeridas

| Servicio | Credencial | Notas |
|---|---|---|
| Neon | `DATABASE_URL` (pooled, SSL) | Proyecto nuevo; activar pgvector |
| OpenBSP | Org + `api-key` (+ `apikey` pública Supabase) | Webhook con `callback_url` + `verify_token`; envío por REST |
| Meta (Graph API) | App propia: `META_APP_ID`, `META_APP_SECRET` | Registro único guiado; OAuth embebido después; Development Mode |
| Resend | `RESEND_API_KEY` + `RESEND_WEBHOOK_SECRET` | Verificar dominio de envío; webhook de bounce/complaint en dashboard Resend → `/api/webhooks/resend` |
| Apify | `APIFY_TOKEN` | Webhook de fin de actor → `/api/webhooks/apify` |
| Tally | Webhook firmado por formulario | HMAC compartido en env |
| Google Calendar | OAuth client JSON | Solo lectura del calendario de citas |
| LLM del agente reactivo | API key del proveedor elegido (opcional) | Se configura en el dashboard de OpenBSP (`AgentExtra.api_key`); sin ella consume los AI credits hosted ($1 incluidos) |
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
- Principio: OpenBSP es dueño del canal y del agente; martes-hub solo jala información (webhook), envía por API y calcula listas deterministas. Sin IA interna — eso llega con Hermes en F9.
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
- Objetivo: calendario editorial con publicación determinística y medición.
- Tareas: app Meta (registro guiado) + OAuth embebido "Conectar cuenta", media library, `social-posts` draft→scheduled→published, job 5 min, `post-metrics` diario, evaluación de `payload-plugin-socials` como acelerador.
- Done when: post precargado se publica solo en su hora y sus métricas aparecen al día siguiente.

### F8 — Formularios y ciclo de vida (Tally)
- Objetivo: voz del cliente y transiciones automáticas de etapa.
- Construido:
  - Colección `form-submissions` (tenant-aware, vinculación a `client` y `lead`, respuestas estructuradas en JSON y raw payload).
  - Webhook `/api/webhooks/tally` con verificación criptográfica HMAC SHA256 (`TALLY_SIGNING_SECRET`) y tokens.
  - Auto-matching por email/teléfono a clientes existentes o creación automática de nuevo lead (`source: 'tally'`).
  - Detección de quejas / bajo NPS (≤6) con disparo automático de notificaciones de advertencia y creación de tareas urgentes.
- Done when: envío desde Tally crea `form-submissions`, asocia cliente/lead y alerta quejas en `notifications` (✅ PR #22).

### F9 — Hermes + Task manager
- Objetivo: IA interna residente en el CRM y gestión de tareas interconectada.
- Construido:
  - Integración oficial de `@payloadcms/plugin-mcp` registrada para clientes, leads, tareas, resúmenes y pagos. Antes de conectarla a Hermes se deben restringir operaciones, rol y tenant según el blueprint del workspace.
  - Colección `tasks` (título, descripción, estados kanban, prioridad, checklist, fechas límite, cliente y lead vinculados).
  - Colección `conversation-summaries` (resúmenes ejecutivos, sentimiento, objeciones y próximos pasos).
  - Creación automática de tareas ante quejas en formularios (`tally_complaint`).
- Done when: herramientas MCP operativas en el backend y tareas gestionables vía vista kanban (✅ PR #23).

### F10 — Hardening
- Objetivo: producción confiable.
- Tareas: revisión seguridad (webhooks firmados, secrets, tokens cifrados), tests de webhooks y jobs, manejo de rate limits/reintentos, backups PITR Neon, CI GitHub Actions.
- Done when: suite de webhooks verde; auditoría de seguridad sin hallazgos High/Critical.

## Qué falta para estar LISTO (v1 operativa)

> Criterio de "listo": el dueño corre su negocio desde el CRM sin herramientas externas.

1. **Construir el workspace operativo** según [`docs/WORKSPACE_UI_SPRINT.md`](docs/WORKSPACE_UI_SPRINT.md): contexto seguro, design system, shell, overview y módulos con datos reales.
2. **Conectar OpenBSP real**: org + número + API keys + agente LLM en dashboard → E2E: lead contactado desde «Hoy» responde y el agente continúa.
3. **Activar Resend**: dominio verificado + `RESEND_API_KEY` + `RESEND_WEBHOOK_SECRET` → E2E: campaña enviada, registrada y bounce detectado.
4. **Configurar Webhook Tally**: apuntar a `https://tu-dominio/api/webhooks/tally` y configurar `TALLY_SIGNING_SECRET`.
5. **Endurecer Hermes/MCP**: ruta AI autenticada, herramientas inicialmente read-only, allowlist por rol/tenant, límites y auditoría.
6. **Hardening básico**: pruebas de aislamiento, revisión de secrets/webhooks y backups PITR verificados.

No bloquean v1: F7 Social (espera app Meta), multi-tenant real (SaaS), limpiar warnings de lint (~46).

## Convenciones de trabajo

- Git: commits convencionales (`type(scope): descripción`); **PRs obligatorios** tras el README inicial — nadie mergea directo a `main` (el merge lo hace el dueño del repo).
- Identidad git: `AngelDelN <57774536+aikapenelope@users.noreply.github.com>`.
- Calidad: todo sprint cierra con typecheck + lint sin errores (y tests donde existan).
- **Antes de CADA push**: correr `pnpm verify` (migrate + build + lint). Es exactamente lo que ejecuta Vercel; `typecheck`/`lint` solos NO bastan — `next build` compila también scripts y vistas cliente y detecta errores que se le escapan a tsc. Los fallos repetidos de deploy de Vercel en agosto 2025 vinieron todos de empujar sin este paso.
- Seguridad: secretos solo en variables de entorno (Vercel/local `.env` nunca commiteado); tokens OAuth cifrados en BD.
- Diagrama del sistema: `docs/diagrams/sistema.excalidraw` (editable en excalidraw.com o VS Code).

## Roadmap opcional (post-F10)

Composio para LinkedIn/TikTok vía Hermes · Metricool API si algún día hay plan Advanced · self-host de OpenBSP en Supabase propio · Sentry si crece el equipo · multi-red desde un mismo editor.
