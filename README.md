# Martes Hub

CRM integral (una empresa, sus clientes hoy; SaaS-ready): mensajería WhatsApp/Instagram, seguimiento proactivo, cobros, membresías, publicaciones en redes con métricas, formularios, citas y agente de IA conectado por MCP.

**Estado actual:** F0–F2 en producción · **F3 completa** (PR #11) · siguiente: **F4 — IA agéntica (OpenBSP agent + MCP)**. Detalle OpenBSP: `docs/plan-openbsp.md`.

| Fase | Estado |
|---|---|
| F0 Fundaciones (scaffold + Neon + Vercel + migraciones en build) | ✅ |
| F1 CRM core (colecciones, RBAC, timeline, kanban, CSV) | ✅ |
| F1b Multi-tenant SaaS-ready (plugin oficial, mono-tenant operativo) | ✅ |
| F2 Dinero (payments/memberships, recordatorios, digest) | ✅ |
| F3a Modelo de mensajería | ✅ |
| F3b/c Webhook + envío + Inbox en admin | ✅ mergeado (#10) |
| F3d Plantillas sync + errores Meta + contactos + notificaciones | 🔵 PR #11 |
| F4 Seguimiento proactivo determinista (lista "Hoy" + click-to-chat) · agente reactivo vive en OpenBSP | ✅ código (#13) — pendiente conexión real del número y agente |
| F5 Email (Resend: adaptador oficial + campaigns + log + webhooks bounce) | ✅ código (#14) — pendiente credenciales Resend |
| F6 Leads por Apify | ❌ descartada — import manual CSV/JSON con plugin oficial; opción futura: Hermes + MCP de Apify en F9 |
| Facturación y cotizaciones (`payload-invoicepdf`) | 🔵 en curso |
| F7–F10 Social · Formularios · Hermes/Tasks · Hardening | ⬜ |

**Cómo vamos:** infraestructura y CRM operativos en producción (admin, cobros con recordatorios, digest diario). Canal WhatsApp/IG construido y probado E2E de punta a punta salvo la llamada HTTP final, que espera únicamente las credenciales hosted de OpenBSP (API key + conectar número). Tras F4 el sistema dice a quién escribirle hoy, el dueño abre la conversación sin costo y el agente de OpenBSP continúa sola.

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
| Agente IA | Reactivo (entrantes): agente nativo de OpenBSP, configurado en su dashboard con LLM propio o AI credits — martes-hub solo espeja por webhook · Proactivo: determinista, sin IA (lista "Hoy" en el admin) · IA interna: Hermes Agent (propio) vía `@payloadcms/plugin-mcp`, llega en F9 |

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
| Task manager | Colección `tasks` propia + vista kanban (evaluar plugin comunitario `payload-kanban-board` como base visual) | Ningún equivalente ClickUp existe sobre Payload; la ventaja es la interconexión nativa con todo el CRM |
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
| `conversation-summaries` | Resumen IA por cliente (sentimiento, próximos pasos) + embeddings pgvector — lo escribe Hermes desde F9 |
| `payments` | Tracking USD: monto, vencimiento, estado, método |
| `memberships` | Ciclo de membresía: inicio, renovación, estado |
| `appointments` | Citas sincronizadas de Google Calendar |
| `offers` | Catálogo de productos/servicios (alimenta cotizaciones, facturas y sugerencias del agente) |
| `invoices` / `quotes` / `shop-info` (plugin invoicepdf) | Facturación comercial interna: line items, IVA, numeración automática, PDFs versionados en Media, envío por email y aceptación de cotizaciones por link |
| `social-accounts` | Cuentas IG/FB (tokens cifrados, expiración) |
| `social-posts` / `post-metrics` | Contenido: draft→scheduled→published/failed; métricas diarias (views, reach, likes…) |
| `scrape-runs` | Ejecuciones Apify (actor, run ID, dataset, estado) |
| `form-submissions` | Entradas Tally: queja / comentario / sugerencia / NPS |
| `tasks` | Task manager interno estilo ClickUp: asignado, cliente relacionado, prioridad, subtareas, kanban |
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

### F7 — Publicaciones sociales + métricas
- Objetivo: calendario editorial con publicación determinística y medición.
- Tareas: app Meta (registro guiado) + OAuth embebido "Conectar cuenta", media library, `social-posts` draft→scheduled→published, job 5 min, `post-metrics` diario, evaluación de `payload-plugin-socials` como acelerador.
- Done when: post precargado se publica solo en su hora y sus métricas aparecen al día siguiente.

### F8 — Formularios y ciclo de vida
- Objetivo: voz del cliente y transiciones automáticas de etapa.
- Tareas: webhooks Tally (queja/comentario/sugerencia/NPS), matching a `clients`, notificaciones internas, reglas de transición de etapa, encuesta post-servicio.
- Done when: queja desde formulario crea notificación y queda vinculada al cliente.

### F9 — Hermes + Task manager
- Objetivo: IA interna residente en el CRM y gestión de tareas interconectada.
- Tareas: `@payloadcms/plugin-mcp` (permisos por colección) + conexión de Hermes, resúmenes de conversación (`conversation-summaries` + pgvector) al cerrar hilo y semanalmente, reporte semanal, colección `tasks` + kanban + reglas de creación automática (queja→tarea, pago vencido→tarea).
- Done when: Hermes resume una conversación y responde preguntas del CRM vía MCP; tarea se crea sola ante evento definido.

### F10 — Hardening
- Objetivo: producción confiable.
- Tareas: revisión seguridad (webhooks firmados, secrets, tokens cifrados), tests de webhooks y jobs, manejo de rate limits/reintentos, backups PITR Neon.
- Done when: suite de webhooks verde; auditoría de seguridad sin hallazgos High/Critical.

## Convenciones de trabajo

- Git: commits convencionales (`type(scope): descripción`); **PRs obligatorios** tras el README inicial — nadie mergea directo a `main` (el merge lo hace el dueño del repo).
- Identidad git: `AngelDelN <57774536+aikapenelope@users.noreply.github.com>`.
- Calidad: todo sprint cierra con typecheck + lint sin errores (y tests donde existan).
- **Antes de CADA push**: correr `pnpm verify` (migrate + build + lint). Es exactamente lo que ejecuta Vercel; `typecheck`/`lint` solos NO bastan — `next build` compila también scripts y vistas cliente y detecta errores que se le escapan a tsc. Los fallos repetidos de deploy de Vercel en agosto 2025 vinieron todos de empujar sin este paso.
- Seguridad: secretos solo en variables de entorno (Vercel/local `.env` nunca commiteado); tokens OAuth cifrados en BD.
- Diagrama del sistema: `docs/diagrams/sistema.excalidraw` (editable en excalidraw.com o VS Code).

## Roadmap opcional (post-F10)

Composio para LinkedIn/TikTok vía Hermes · Metricool API si algún día hay plan Advanced · self-host de OpenBSP en Supabase propio · Sentry si crece el equipo · multi-red desde un mismo editor.
