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
| Captura por voz (PWA) | Rutas móviles instalables (manifest + service worker) · MediaRecorder · Whisper API (Groq u OpenAI) con fallback Web Speech API · extracción de campos con LLM |

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
| Archivos (media/documentos/audios) | `storage-vercel-blob` desde F1 — disco de Vercel es efímero | Local disk (se pierde en deploys); S3/R2 solo si el volumen lo justifica |
| Tenencia de datos | **Single-tenant + roles** (equipo pequeño ve lo mismo; scoping opcional por agente asignado) | Multi-tenant (solo si algún día se venden espacios a otros negocios — ruta documentada abajo) |

## Estructura de la aplicación (una sola app, dos caras)

Payload 3 vive dentro de Next.js, así que el admin y la PWA comparten repo, dominio,
deploy y base de datos. No hay segundo proyecto:

```
src/
├── app/
│   ├── (admin)/admin/…        → Dashboard Payload: Hoy · Inbox · Kanban · Calendario · KPIs
│   ├── captura/               → PWA móvil de campo (instalable en el teléfono)
│   │   └── page.tsx           → botón GRABAR + formulario confirmable
│   ├── manifest.ts            → hace instalable la PWA (icono en home screen)
│   ├── api/captura/
│   │   ├── transcribir/route.ts → recibe audio → Whisper API → texto
│   │   └── extraer/route.ts     → texto → LLM extrae campos estructurados
│   └── api/webhooks/…         → openbsp · apify · tally · gcal
├── payload.config.ts
├── collections/ · jobs/ · endpoints/ · integrations/ · access/
```

La PWA usa las mismas colecciones (`leads` / `clients` / `activities`) y el mismo
control de acceso por roles del admin. El audio original se guarda como documento
adjunto (colección `media`) para auditar lo dictado.

## Plugins seleccionados (verificados en docs oficiales)

### Oficiales que SÍ entran

| Plugin | Para qué en Martes Hub | Sprint |
|---|---|---|
| `@payloadcms/db-postgres` | Adapter de base de datos → Neon (pooled + SSL) | F0 |
| `@payloadcms/email-nodemailer` | Transporte de email vía Resend | F2/F5 |
| `@payloadcms/storage-vercel-blob` | Almacenamiento de media/documentos/audios — **obligatorio**: el disco de Vercel es efímero y los archivos locales se pierden entre deploys. Token `BLOB_READ_WRITE_TOKEN` del propio proyecto Vercel | F1 |
| `@payloadcms/plugin-import-export` | Import/export CSV de clientes, leads y pagos | F1 |
| `@payloadcms/plugin-mcp` | Expone el CRM como tools MCP para Hermes (permisos por colección) | F9 |
| `payload-reserve` o `payload-appointments-plugin` | **Calendario de citas dentro del admin** (decisión del dueño): UI de agenda, detección de conflictos/dobles reservas. Google Calendar sigue siendo fuente externa para el digest diario y las citas que crea el agente de OpenBSP | F8 |
| `payload-auditor` (~76★, ~2 kB, cero dependencias) | Audit log centralizado listo: tracking de eventos críticos, comportamiento de usuarios y seguridad del backend | F10 |

> Si el volumen de archivos crece mucho, `@payloadcms/storage-s3` permite migrar a Cloudflare R2 (más barato por GB) sin cambiar nada más: es el mismo patrón de adapter sobre colecciones.

### Oficiales evaluados — NO entran (por ahora)

| Plugin | Motivo |
|---|---|
| `plugin-multi-tenant` | Decisión consciente, ver asesoría abajo |
| `plugin-stripe` | Cobros son tracking manual; entra solo si algún día cobran online |
| `plugin-form-builder` | Tally cubre formularios externos; queda como opción si quieren formularios internos sin Tally |
| `plugin-search` | Los filtros/búsqueda nativos del admin bastan para el equipo; pgvector cubre búsqueda semántica |
| `plugin-seo`, `plugin-redirects`, `live-preview`, `nested-docs` | Este repo no tiene sitio público; la landing ya vive en otro proyecto |
| `plugin-sentry` | Observabilidad nativa Vercel+Neon basta (sistema privado) |

### Comunidad (investigadas en payload.market, payloaddirectory.dev y el topic `payload-plugin` de GitHub)

#### Recomendadas — entran al plan

| Plugin | Qué hace | Veredicto |
|---|---|---|
| `@ai-stack/payloadcms` (**payload-ai**, ~530★, 2.8k desc/sem, MIT, probado con v3.84) | Botones IA dentro de los campos del admin: redactar, corregir, traducir, reescribir; genera imágenes y voz; bring-your-own-model (OpenAI/Anthropic/Gemini); acceso por rol | **F5/F7** — redactar captions de posts y textos de campañas sin salir del admin. Los resúmenes de conversaciones siguen siendo jobs propios (esto es edición en editor, no background) |
| `payload-dashboard-analytics` (NouanceLabs) | Gráficos y métricas dentro del admin | ⚠️ **F9 con advertencia**: el repo no recibe pushes desde ago-2023 (stale) — evaluar compatibilidad real con v3 actual antes de adoptar; alternativa: charts propios o utilidades de la suite shefing |
| `payload-totp` | 2FA por código temporal para usuarios del admin | **F10** — seguridad seria y barata para sistema privado multiusuario (tú, esposa, empleados) |
| `payload-openapi` (~120★, actualizado esta semana) | Genera especificación OpenAPI/Swagger del REST de Payload | **Transversal** — documenta la API que consumen Hermes e integraciones |

#### Evaluadas — decisión al llegar el sprint

| Plugin | Qué hace | Cuándo decidir |
|---|---|---|
| `payload-kanban-board` (40★, v3) | Vista kanban arrastrable con estados configurables por colección | F9 — base visual del task manager; si su calidad no convence, vista propia |
| `payload-plugin-socials` | Publicación multi-red (IG/FB/Pinterest) con OAuth adapters, scheduling y audit trail | F7 — si cubre nuestro flujo acelera; si no, publisher propio |
| `payload-plugin-scheduler` | Campo fecha + UI de programación editorial | F7 — solo pulido UX; la ejecución real ya es Jobs Queue |
| `payload-rbac` (teunmooij/payload-tools) | Permisos granulares declarativos | F1 — solo si el RBAC nativo campo-a-campo se vuelve verboso |
| `payload-workflow` (DennisSnijder) | Máquina de estados/workflows sobre colecciones | F8 — transiciones del ciclo de vida del cliente |
| Passkey (WebAuthn vía Better Auth, 884 desc/sem) | Login con huella/clave del dispositivo | Post-F10 — alternativa moderna al password; requiere evaluar integración |

#### Evaluadas a fondo (revisión de repositorios)

| Plugin | Cómo funciona | Madurez | Veredicto |
|---|---|---|---|
| `payload-agent` (aamdmn) — chat-agent por Telegram/Slack/**WhatsApp** | El LLM escribe TypeScript que se ejecuta contra la API Local de Payload ("Code Mode"); orquestación TanStack AI + Chat SDK; proveedores Anthropic/OpenAI. Puede consultar colecciones, crear/editar documentos y gestionar uploads conversando | **Temprana**: v0.10.0, 16★, última publicación jun-2026; medios salientes aún "en progreso" | Tu caso de uso interno (gestionar el CRM conversando desde TU WhatsApp personal, separado del canal de clientes) es exactamente lo que hace. Hoy ese rol lo cumple Hermes+MCP con protocolo estándar — este queda como **alternativa directa a comparar en F9**: menos maduro, pero casi sin construcción propia |
| `@mvriu5/payload-ai` (**AI Assistant**, dentro del dashboard) | Chat en el panel admin: lee esquemas y documentos, acepta @-menciones de colecciones, y **propone** acciones crear/actualizar/borrar firmadas con HMAC derivado de `PAYLOAD_SECRET` y verificadas server-side antes de aplicarse (el modelo no puede colar cambios arbitrarios). Vercel AI SDK: OpenAI/Claude/Gemini/Mistral/OpenRouter u Ollama. Permisos por colección, límites de tokens por usuario (ventanas 24h/7d) y audit log con estado antes/después de cada propuesta aplicada | **Joven pero bien diseñado**: v1.6.4 activa (jul-2026), 130 desc/sem — pero 3★ y desarrollador único (riesgo de abandono) | Sí es pariente del chat-agent (ambos dejan al LLM operar el CRM), con superficie distinta: este vive DENTRO del admin y trae cinturón de seguridad formal (propuestas firmadas + auditoría + cuotas). Perfecto para que esposa/empleados trabajen asistidos por IA sin riesgo. Candidato fuerte F9 junto al `plugin-mcp` |
| `payload-invoices` (Poseidonas) — facturación secuencial PDF | Facturas y notas de crédito con numeración *gapless* garantizada (contador compare-and-set dentro de la transacción de Postgres), snapshot congelado de precios, montos en enteros menores sin redondeo, PDF generado por encoder propio sin dependencias, formato `SERIE-AÑO-00001` con reinicio anual, descarga en `/api/invoices/:id/pdf` | **Recién nacida, técnica impecable**: v1.0.1 publicada hace días, 337 desc/sem, 0★ | Limitación clave: se engancha a órdenes del plugin oficial `plugin-ecommerce`, que NO usamos (cobros = tracking manual). Si algún día formalizan facturación hay dos caminos: adoptar ecommerce+invoices, o replicar su patrón (contador gapless + encoder PDF) sobre nuestra colección `payments`. No entra ahora |
| `payload-reserve` (elghaied) — reservas con conflictos | Detección de dobles reservas, UI calendario, máquina de estados con políticas de cancelación personalizables, colecciones de servicios/recursos/clientes, REST público para integraciones, capacidad/inventario, idempotencia y hooks de ciclo de vida | **La más madura de las cuatro**: v4.0.0, 31★, 291 desc/sem, actualizada esta semana | **ADOPTADO por decisión del dueño**: el calendario de citas vivirá dentro de Payload. Convivencia definida: GCal sigue siendo fuente externa (digest diario + citas del agente OpenBSP); las reservas gestionadas por el equipo viven aquí con UI propia. En F8 se hace head-to-head contra `payload-appointments-plugin` (97★, motor de disponibilidad con zona horaria de negocio — ideal para UTC-4 —, citas recurrentes, iCal y waitlist… pero marcado WIP por su autor) |

🎁 Hallazgo extra del research: el mismo autor de `payload-reserve` tiene un plugin de **notificaciones in-dashboard con actualizaciones en vivo** — candidato directo para nuestra colección `notifications` (queja nueva, pago vencido, lead caliente) en F8/F9.

#### Autores prolíficos y suites — ranking por estrellas (GitHub API, `topic:payload-plugin`, ago-2026)

| Repositorio (autor) | ★ | Último push | Contenido | Interés para Martes Hub |
|---|---|---|---|---|
| ashbuilds/payload-ai | 544 | ago-2026 | payload-ai | ✅ Ya adoptado (F5/F7) |
| r1tsuu/payload-enchants | 334 | ene-2025 ⚠️ stale | Suite de mejoras de UI/campos | Descartada por inactividad |
| payload-auth/payload-auth | 331 | ago-2026 | Better Auth para Payload | No aplica (auth nativo basta) |
| NouanceLabs (better-fields 292★ / dashboard-analytics 183★) | — | abr-2025 / ago-2023 ⚠️ | Campos mejorados + charts | better-fields opcional; analytics con advertencia de staleness |
| shefing/payload-tools | 180 | **ago-2026 activa** | Suite: RBAC + ABAC, quickfilter, comentarios ricos en docs, right-panel de entidades relacionadas, diff antes de publicar | 🔍 Candidatos puntuales: su RBAC/ABAC si el nativo se queda corto (F1), quickfilter y comentarios para colaboración interna |
| joas8211/payload-tenancy | 178 | sep-2025 | Multi-tenancy alternativa | Respaldo documentado si algún día activamos tenencia |
| GeorgeHulpoi/payload-totp | 158 | ago-2026 | 2FA TOTP | ✅ Ya adoptado (F10) |
| teunmooij/payload-tools (openapi/swagger/rbac) | 141 | jul-2024 ⚠️ stale | Suite devtools | Preferimos `payload-oapi` (janbuchar, 123★, feb-2026) |
| rilrom/payload-bites | 111 | jul-2026 | Colección de micro-plugins v3 | Fuente de utilidades pequeñas a revisar al necesitar algo puntual |
| jhb-software/payload-plugins | 101 | **push hoy** | Suite: **admin-search** (búsqueda global Cmd+K), **alt-text IA**, **geocoding** (autocompletado Google Places → campo punto), pages, cloudinary, translator | 🔍 admin-search candidato directo (F1); geocoding útil para direcciones de clientes; alt-text IA para media |
| oversightstudio/payload-plugins | 81 | ago-2026 | Suite (Mux video, etc.) | Sin necesidad hoy |
| shaadcode/payload-auditor | 76 | jul-2026 | Audit log ~2 kB cero deps | ✅ Ya adoptado (F10) |
| ahmetskilinc/payload-appointments-plugin | 97 | ago-2026 | Citas completas: vista calendario, motor de disponibilidad con zona horaria, recurrentes, iCal, waitlist, depósitos | 🔍 Head-to-head contra `payload-reserve` en F8 (WIP declarado por autor, pero el más completo) |
| elghaied (suite) | reserve 31 · eve-chat 12 · invoicepdf 9 · notifications 5 · sms 4 | ago-2026 activa | Reserve, chat Eve, notificaciones live, SMS multi-proveedor, PDF facturas | reserve ✅ adoptado; eve-chat entra al head-to-head F9; notifications candidata F8/F9 |
| aamdmn (suite) | agent 16 · cli 10 | jun-2026 | Chat-agent multi-plataforma + CLI para agentes | Alternativa F9 (ver evaluación arriba) |
| Poseidonas (suite) | invoices/barcodes/vat/etc. | ago-2026 | Facturación, códigos, VAT | Futuro si formalizan facturación |
| DanailMinchev/awesome-payload | ~92 | lista curada | El índice comunitario de referencia | Punto de partida para futuras búsquedas |

> Nota metodológica: estrellas ≠ madurez. Se priorizó actividad reciente (push ≤ 60 días) y compatibilidad v3 explícita. Los marcados ⚠️ tienen estrellas altas pero repos dormidos.

#### Descubiertas — NO aplican hoy (registradas por si cambia el negocio)

- **Llms-txt / AI Localization / AI control panel** (marketplace): variantes de IA para sitios públicos — este repo no tiene frontend público.
- **Mux Video**: hosting/transcodificación de video — Vercel Blob sirve los medios actuales.
- `payload-better-fields`, `payload-enchants`, `payload-visual-editor`, `payload-lexical-typography`: mejoras generales de editor/UI — opcionales cosméticas.
- `payload-oauth2` / `payload-authjs` / Passkey-like auth: descartados por ahora — equipo pequeño, auth nativo basta.

## Multi-tenant o datos compartidos? — Asesoría

**Recomendación: NO usar multi-tenant ahora. Single-tenant con roles.**

Son tres necesidades distintas que conviene no confundir:

1. **"Mi esposa y mis empleados entran a ver los mismos datos"** (tu caso hoy)
   → Solo se crean más `users` con roles (`admin` / `agente` / `viewer`). Cero complejidad extra. Todos ven el mismo CRM.

2. **"Que cada quien vea SOLO sus clientes asignados"**
   → Eso **no es multi-tenant**, es *scoping por asignación*: un campo `assignedTo` en `clients`/`leads`/`tasks` y una regla de access control ("agente ve únicamente lo suyo; admin ve todo"), con un toggle en `company-settings` para activarlo/desactivarlo. Se construye en F1 y es reversible.

3. **Multi-tenant real** (el plugin oficial): varias **empresas aisladas** dentro de la misma instalación — cada empresa con sus propios clientes, mensajes y pagos, invisible para las demás. Tiene sentido solo si algún día vendes el sistema a otros negocios o quieres aislar completamente dos líneas de negocio.

**Por qué decidirlo ahora:** activar multi-tenant después implica añadir el campo `tenant` a todas las colecciones, el array `tenants` a los usuarios y revisar cada regla de acceso custom — es un refactor con riesgo sobre un sistema vivo. Documentarlo como decisión explícita evita sorpresas.

**Ruta de migración futura (si llegara el caso):** crear colección `tenants` → activar `multiTenantPlugin({ collections: { clients: {}, leads: {}, conversations: {}, … } })` → el plugin agrega campos/filtros base automáticamente → migrar usuarios al array de tenants. El plugin está oficialmente mantenido, así que la puerta queda abierta.

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
| Vercel Blob | `BLOB_READ_WRITE_TOKEN` | Se habilita Blob en el proyecto Vercel (media, documentos, audios) |
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
- Tareas: colecciones `users`(roles)/`clients`/`leads`/`activities`/`segments`/`documents`/`company-settings`; RBAC campo a campo; **storage Vercel Blob para media y documentos**; campo `assignedTo` + toggle "agentes solo ven sus clientes" en `company-settings`; vista kanban del pipeline; import/export CSV.
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
- Tareas: webhooks Tally (queja/comentario/sugerencia/NPS), matching a `clients`, **calendario de citas dentro del admin: head-to-head `payload-reserve` vs `payload-appointments-plugin` (zona horaria UTC-4, recurrentes, iCal)** con convivencia definida junto al sync de Google Calendar, notificaciones internas (evaluar plugin live-updates de elghaied), reglas de transición de etapa, encuesta post-servicio.
- Done when: queja desde formulario crea notificación y queda vinculada al cliente.

### F9 — Hermes + MCP + Task manager
- Objetivo: agente dentro del CRM y gestión de tareas interconectada.
- Tareas: `@payloadcms/plugin-mcp` (permisos por colección), conexión de Hermes, **evaluación head-to-head de asistentes: Hermes/MCP vs `payload-agent` (WhatsApp interno) vs AI Assistant (`@mvriu5/payload-ai`, propuestas firmadas en dashboard) vs `payload-eve-chat` (chat `/admin/eve` sobre Vercel Eve + nuestro propio MCP)**, reporte semanal, colección `tasks` + kanban + reglas de creación automática (queja→tarea, pago vencido→tarea), notificaciones internas (evaluar plugin de elghaied con live updates).
- Done when: Hermes responde preguntas del CRM vía MCP; tarea se crea sola ante evento definido.

### F10 — Hardening
- Objetivo: producción confiable.
- Tareas: revisión seguridad (webhooks firmados, secrets, tokens cifrados), **audit log con `payload-auditor`**, tests de webhooks y jobs, manejo de rate limits/reintentos, backups PITR Neon.
- Done when: suite de webhooks verde; auditoría de seguridad sin hallazgos High/Critical.

### F11 — Captura por voz (PWA interna de campo)
> Solo depende de F1; puede ejecutarse en paralelo desde ahí.

- Objetivo: registrar personas hablando — grabo la conversación, la app transcribe, propone los campos y guarda en el CRM.
- Tareas: `manifest.ts` + service worker (PWA instalable), ruta móvil `/captura` con botón GRABAR (MediaRecorder), endpoint `/api/captura/transcribir` (audio → Whisper API de Groq u OpenAI, ~$0.006/min; fallback sin costo: Web Speech API para dictado directo), endpoint `/api/captura/extraer` (LLM convierte el texto libre en nombre/teléfono/email/interés/rubro/notas), formulario prellenado confirmable antes de guardar, guardado en `leads`/`clients` + `activity` con audio adjunto.
- Done when: grabo 30 s dictando datos de una persona real → formulario prellenado correcto → confirmo → el lead aparece en el CRM con su audio adjunto y actividad registrada.

## Documentación interna

- **`AGENTS.md`** — reglas obligatorias para cualquier sesión/agente (se carga al inicio).
- **`docs/BEST-PRACTICES.md`** — manual de buenas prácticas: las 5 reglas base validadas
  contra docs oficiales, reglas de oro del proyecto y checklist pre-PR. Consultar SIEMPRE
  antes de tocar código.
- **`docs/payload-sdk/`** — SDK de documentación oficial de Payload descargado
  (`SKILL.md` + 11 referencias: Local API, hooks, access control, endpoints, adapters,
  plugin development… ~6.800 líneas). Fuente primaria para desarrollar.
- `docs/diagrams/sistema.excalidraw` — diagrama completo del sistema.

## Convenciones de trabajo

- Git: commits convencionales (`type(scope): descripción`); **PRs obligatorios** tras el README inicial — nadie mergea directo a `main` (el merge lo hace el dueño del repo).
- Identidad git: `AngelDelN <57774536+aikapenelope@users.noreply.github.com>`.
- Calidad: todo sprint cierra con typecheck + lint sin errores (y tests donde existan).
- Seguridad: secretos solo en variables de entorno (Vercel/local `.env` nunca commiteado); tokens OAuth cifrados en BD.
- Diagrama del sistema: `docs/diagrams/sistema.excalidraw` (editable en excalidraw.com o VS Code).

## Roadmap opcional (post-F10)

Composio para LinkedIn/TikTok vía Hermes · Metricool API si algún día hay plan Advanced · self-host de OpenBSP en Supabase propio · Sentry si crece el equipo · multi-red desde un mismo editor.
