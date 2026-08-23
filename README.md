# Martes Hub

CRM integral **privado** (una empresa, sus clientes): mensajería WhatsApp/Instagram, seguimiento proactivo, cobros, membresías, publicaciones en redes con métricas, formularios, citas y agente de IA conectado por MCP.

**Estado actual:** Fase F0 — documentación y scaffolding.

---

## Stack

| Capa | Tecnología |
|---|---|
| Aplicación | Payload 3.x (framework fullstack Next.js) · TypeScript estricto |
| Base de datos | Neon Postgres (adapter `@payloadcms/db-postgres`, connection string *pooled*, SSL) + `pgvector` |
| Hosting | Vercel (serverless) + scheduler externo gratuito para crons sub-diarios (fase inicial) |
| Mensajería | OpenBSP (`matiasbattocchia/open-bsp-api`) sobre Meta Cloud API: WhatsApp + Instagram DM |
| Email | Resend (transporte Nodemailer nativo de Payload) |
| Ingesta de leads | Apify (actors → webhook → colección `leads`) |
| Formularios | Tally (webhooks firmados → `form-submissions`) |
| Citas | Google Calendar API v3 (solo lectura; el agente de OpenBSP crea las citas) |
| Publicación social | Meta Graph API directa, flujo determinístico (Jobs Queue), OAuth embebido en el admin |
| Agente IA | Hermes Agent (propio) vía `@payloadcms/plugin-mcp` |

## Configuración regional

- Moneda: **USD**
- Zona horaria: **America/Caracas (UTC-4)** — aplica a crons, calendario editorial y digestios.
- Idioma del admin/producto: español.

## Decisiones técnicas cerradas (con alternativas descartadas)

| Decisión | Elegido | Descartado / motivo |
|---|---|---|
| Publicación social | Meta Graph directo + OAuth embebido (app en Development Mode: cuentas propias, sin App Review) | Metricool API (requiere plan Advanced); Composio (tercero en camino crítico) queda como expansión futura a otras redes |
| Orquestación interna | Payload Jobs Queue + cron externo | n8n / ActivePieces (duplican lógica y webhooks; se pueden añadir después sin rediseño) |
| IA en background | Jobs Queue llamando LLM + pgvector para búsqueda semántica | "IA en Neon": Neon es Postgres puro, no tiene IA nativa |
| MCP hacia Hermes | `@payloadcms/plugin-mcp` (oficial, sincronizado con core) | `payload-plugin-mcp` de Antler Digital (buena alternativa si falta algo) |
| Observabilidad | Logs/métricas nativas Vercel + Neon | Sentry (opcional futuro; sistema privado) |
| Task manager | Colección `tasks` propia + vista kanban (evaluar plugin comunitario `payload-kanban-board` como base visual) | Ningún equivalente ClickUp existe sobre Payload; la ventaja es la interconexión nativa con todo el CRM |

## Modelo de datos (colecciones)

| Colección | Propósito |
|---|---|
| `users` | Auth + roles: admin / agente / viewer (RBAC por colección y campo) |
| `clients` | Cliente: datos, etapa de ciclo de vida, agente asignado, consentimiento/opt-out |
| `leads` | Prospects crudos (fuente: Apify, Tally, manual, DM) con pipeline y rubro |
| `activities` | Log unificado de interacciones |
| `conversations` / `messages` | Hilos por canal (whatsapp / instagram_dm / email) y mensajes con estado Meta |
| `message-templates` | Plantillas WhatsApp aprobadas + respuestas rápidas |
| `conversation-summaries` | Resumen IA por cliente (sentimiento, próximos pasos) + embeddings pgvector |
| `payments` | Tracking USD: monto, vencimiento, estado, método |
| `memberships` | Ciclo de membresía: inicio, renovación, estado |
| `appointments` | Citas sincronizadas de Google Calendar |
| `offers` | Catálogo de productos/servicios (alimenta sugerencias del agente) |
| `sequences` | Flujos de seguimiento configurables desde el admin (pasos, esperas, canales) |
| `social-accounts` | Cuentas IG/FB (tokens cifrados, expiración) |
| `social-posts` / `post-metrics` | Contenido: draft→scheduled→published/failed; métricas diarias (views, reach, likes…) |
| `scrape-runs` | Ejecuciones Apify (actor, run ID, dataset, estado) |
| `form-submissions` | Entradas Tally: queja / comentario / sugerencia / NPS |
| `tasks` | Task manager interno estilo ClickUp: asignado, cliente relacionado, prioridad, subtareas, kanban |
| `documents` | Contratos/facturas PDF por cliente (uploads) |
| `segments` | Segmentos/tags (p. ej. rubro del lead) |
| `notifications` | Centro de notificaciones internas |
| `company-settings` (global) | Empresa, horarios, políticas de recordatorio, textos, zona horaria |

## Automatizaciones (Jobs Queue)

| Job | Frecuencia | Función |
|---|---|---|
| `publish-scheduled-posts` | 5 min | Publica `social-posts` vencidos vía Graph API |
| `sync-gcal` | 15 min | Sincroniza citas de Google Calendar |
| `lead-follow-up` | horario | Ejecuta secuencias según `sequences`; se detiene si responde |
| `payment-reminders` | diario 08:00 UTC-4 | Cobros por vencer/vencidos → WhatsApp plantilla + email |
| `score-engagement` | cada hora | Score por cliente para la lista "Hoy" |
| `fetch-social-metrics` | diario | Métricas IG/FB → `post-metrics` |
| `generate-summary` | al cerrar conversación + semanal | Resumen IA por cliente |
| `refresh-tokens` | diario | Renueva long-lived tokens Meta (~55 días) |
| `daily-digest` | diario 08:00 UTC-4 | Resumen interno: citas del día, pagos, leads nuevos, tareas vencidas |
| `weekly-report` | lunes 08:00 | Reporte generado por Hermes vía MCP |

## Integraciones y credenciales requeridas

| Servicio | Credencial | Notas |
|---|---|---|
| Neon | `DATABASE_URL` (pooled, SSL) | Proyecto nuevo; activar pgvector |
| OpenBSP | Org + `api-key` (+ `apikey` pública Supabase) | Webhook con `callback_url` + `verify_token`; envío por REST |
| Meta (Graph API) | App propia: `META_APP_ID`, `META_APP_SECRET` | Registro único guiado; OAuth embebido después; Development Mode |
| Resend | `RESEND_API_KEY` | Verificar dominio de envío |
| Apify | `APIFY_TOKEN` | Webhook de fin de actor → `/api/webhooks/apify` |
| Tally | Webhook firmado por formulario | HMAC compartido en env |
| Google Calendar | OAuth client JSON | Solo lectura del calendario de citas |
| LLM resúmenes | API key del proveedor elegido en F4 | Puede delegarse a Hermes |
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

### F4 — IA proactiva
- Objetivo: seguimiento automático que conversa y resume.
- Tareas: `sequences` configurables, job `lead-follow-up` con plantillas, `generate-summary` con embeddings pgvector, score de engagement.
- Done when: lead sin responder recibe secuencia día 1/3/7 y se detiene al responder; resumen visible en ficha del cliente.

### F5 — Email automatizado (Resend)
- Objetivo: transaccionales + campañas.
- Tareas: transporte Resend, dominio verificado, `email-campaigns`/`email-log`, plantillas base.
- Done when: campaña de prueba enviada y loggeada; bounce registrado.

### F6 — Leads por Apify
- Objetivo: prospectos llegan solos, limpios y clasificados.
- Tareas: actor de scraping, webhook → `scrape-runs`, normalización a `leads` con rubro, dedupe por teléfono/email.
- Done when: run real genera leads deduplicados etiquetados por rubro.

### F7 — Publicaciones sociales + métricas
- Objetivo: calendario editorial con publicación determinística y medición.
- Tareas: app Meta (registro guiado) + OAuth embebido "Conectar cuenta", media library, `social-posts` draft→scheduled→published, job 5 min, `post-metrics` diario, evaluación de `payload-plugin-socials` como acelerador.
- Done when: post precargado se publica solo en su hora y sus métricas aparecen al día siguiente.

### F8 — Formularios y ciclo de vida
- Objetivo: voz del cliente y transiciones automáticas de etapa.
- Tareas: webhooks Tally (queja/comentario/sugerencia/NPS), matching a `clients`, notificaciones internas, reglas de transición de etapa, encuesta post-servicio.
- Done when: queja desde formulario crea notificación y queda vinculada al cliente.

### F9 — Hermes + MCP + Task manager
- Objetivo: agente dentro del CRM y gestión de tareas interconectada.
- Tareas: `@payloadcms/plugin-mcp` (permisos por colección), conexión de Hermes, reporte semanal, colección `tasks` + kanban + reglas de creación automática (queja→tarea, pago vencido→tarea).
- Done when: Hermes responde preguntas del CRM vía MCP; tarea se crea sola ante evento definido.

### F10 — Hardening
- Objetivo: producción confiable.
- Tareas: revisión seguridad (webhooks firmados, secrets, tokens cifrados), tests de webhooks y jobs, manejo de rate limits/reintentos, backups PITR Neon.
- Done when: suite de webhooks verde; auditoría de seguridad sin hallazgos High/Critical.

## Convenciones de trabajo

- Git: commits convencionales (`type(scope): descripción`); **PRs obligatorios** tras el README inicial — nadie mergea directo a `main` (el merge lo hace el dueño del repo).
- Identidad git: `AngelDelN <57774536+aikapenelope@users.noreply.github.com>`.
- Calidad: todo sprint cierra con typecheck + lint sin errores (y tests donde existan).
- Seguridad: secretos solo en variables de entorno (Vercel/local `.env` nunca commiteado); tokens OAuth cifrados en BD.
- Diagrama del sistema: `docs/diagrams/sistema.excalidraw` (editable en excalidraw.com o VS Code).

## Roadmap opcional (post-F10)

Composio para LinkedIn/TikTok vía Hermes · Metricool API si algún día hay plan Advanced · self-host de OpenBSP en Supabase propio · Sentry si crece el equipo · multi-red desde un mismo editor.
