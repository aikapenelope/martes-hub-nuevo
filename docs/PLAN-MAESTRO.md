# PLAN MAESTRO — Continuación del desarrollo (Composio + Social + ideas-futuras)

> **Documento de continuidad** — léelo COMPLETO al iniciar un chat nuevo.
> Última actualización: 2026-09-10. Estado: PRs #117 (Composio base+social),
> #118 (TikTok) y #119 (doc segundo WhatsApp) — #117 mergeado; #118/#119
> verificar estado al arrancar (`gh pr list --state open`).

---

## 0. REGLAS DE TRABAJO — obligatorias en cada sesión

Este proyecto tiene una forma establecida de trabajar. NO la improvises:

1. **Skill de Payload SIEMPRE primero** al tocar colecciones/hooks/jobs/queries:
   `/Users/angelpenalver/.agents/skills/payload/SKILL.md`. Lo que diga esa
   skill manda sobre tu memoria (ej.: `beforeValidate` para formateo/cifrado,
   `overrideAccess: false` + `user` SIEMPRE en Local API por usuario, `req` en
   operaciones anidadas, `req.context` para cortar loops de hooks, sin
   `versions.drafts` en colecciones con UI custom — decisión deliberada del
   repo, ver comentario en `SocialPosts.ts`).
2. **Codegraph antes de escribir código**: `codegraph_explore` (o
   `codegraph_node`) para ver cómo están conectados los símbolos que vas a
   tocar y su blast radius. Tras cambios grandes: `codegraph sync .` +
   `codegraph status .`.
3. **AGENTS.md aplica** (raíz del repo): esta versión de Next.js tiene cambios
   frente a tu entrenamiento — lee `node_modules/next/dist/docs/` antes de
   escribir rutas/servidores.
4. **Docs oficiales con MCP, nunca de memoria**:
   - **Context7**: libs `/composiohq/composio` y `/websites/composio_dev`
     (Composio), y Payload cuando haga falta. Consulta ANTES de codificar
     firmas/args/slugs.
   - **Firecrawl**: scraping de páginas oficiales (toolkits de Composio,
     pricing, docs de Meta).
   - **Skill de Composio instalada** en `.agents/skills/composio/` — sus reglas
     (`rules/app-*.md`) son la referencia operativa: NUNCA adivines slugs ni
     args (verifícalos con `composio.tools.get` / docs), versión de toolkit
     fijada por llamada (nunca `'latest'`), `link()` para managed auth,
     `userId` prefijado y aislado.
5. **Convenciones del repo** (romperlas = review de Devin lo bandera):
   - Nada del grafo de `payload.config.ts` (colecciones, jobs, lib que ellos
     importen) puede importar `server-only` — lanza en `generate:types`/
     `migrate` (convención: `lead-scoring.ts`, `crm-pipeline-window.ts`).
   - Errores crudos de proveedores NUNCA llegan a la UI: `safeError`/
     `sanitizeErrorForUi`; el crudo queda en BD (`lastError`) y logs.
   - Idempotencia garantizada EN LA BASE DE DATOS (índices únicos, de
     preferencia parciales para columnas nullable) + manejo del conflicto
     23505 (`isUniqueConflict` en syncEmail/syncGcal). OJO: no "atrapar" un
     23505 y seguir consultando por el mismo `req` — la transacción queda
     abortada.
   - Tests: fixtures con fechas congeladas e inyección de `now` (los tests de
     lead-scoring rompieron en producción por `Date.now()` real — lección en
     `tests/int/lead-scoring.int.spec.ts`). CI NO tiene tu `.env` local:
     aislar env en `beforeEach`.
   - Migraciones: production NO usa `push` — toda cambio de schema lleva
     migración SQL (estilo de `src/migrations/20260909_200000_*.ts`) +
     registro en `src/migrations/index.ts` + `pnpm generate:types`.
   - Commits en rama → PR → **squash-merge** (los ancestros de rama no sirven
     para saber qué está mergeado). Devin revisa cada PR en varias rondas:
     atiende SUS prompts, coteja contra el código real y responde en el PR.
6. **Decisiones de producto ya cerradas** (no reabrir sin el usuario):
   - Composio BYO-key: cada tenant usa SU proyecto (key asignada por el
     superadmin desde `/admin → Integraciones del Tenant`, campo write-only
     `apiKey` cifrado con `INTEGRATIONS_ENC_KEY`); la env `COMPOSIO_API_KEY`
     es SOLO del tenant default (Martes) y exige `WORKSPACE_DEFAULT_TENANT`
     explícito. Sin fallback universal (nadie consume cuota ajena).
   - Sin fallback a la API de Meta en social: si Composio falla, error crudo
     en BD + UI sanitizada, y se espera mejora.
   - WhatsApp primario = OpenBSP (UN número, el de la plataforma); el segundo
     WhatsApp de negocio entra por Composio (Cloud API) al MISMO inbox (doc 07).
   - Renovación de membresías = 1 clic manual (sin auto-renew).
   - Media social temporal: 48h + miniatura (purge SOLO con marcador
     `socialTemp`).
   - Alcances de conexión: `empresa` (admin conecta, todos usan) vs `personal`
     (cada usuario, la suya) — `tenant-connections.scope`.

---

## 1. ESTADO ACTUAL DEL SISTEMA (verificado en código)

### Composio (base — PRs #117/#118)
- **SDK** `@composio/core@0.18.1` server-side. Cliente:
  `src/integrations/composio/client.ts` — `getComposioForTenant` (key del
  tenant cifrada → operador solo para default), `getOrCreateManagedAuthConfig`
  (get-or-create managed; TikTok = custom con TIKTOK_CLIENT_ID/SECRET),
  `createConnectionLink` (hosted, callback `/auth/composio/callback`),
  `verifyConnection` (lista FILTRADA por authConfig+toolkit), `executeTool`
  (versión fijada desde `toolkits.get().meta.availableVersions[0]`, cache 1h).
- **Modelo**: `tenant-integrations` (1 fila/tenant, key cifrada AES-GCM en
  `src/lib/crypto.ts`, campo write-only `apiKey`, field-access read:false) +
  `tenant-connections` (1 fila por tenant+toolkit+scope, uniques parciales;
  scope `empresa`/`personal`; `config` json p.ej. calendarId; `ultimoError`
  crudo). `social-accounts` con `composioConnectedAccountId/externalUserId/
  syncStatus/lastSyncAt`.
- **Server actions** (`src/lib/integration-actions.ts`): saveComposioKey
  (valida contra Composio; rotación resetea conexiones), start (link),
  verify (atómica: identidad IG → espejo → recién ahí 'ok'; fallo →
  'conectando' reintentable), ping (estado ACTIVE), disconnect (revoca),
  syncNow (Sincronizar ahora por toolkit, admin).
- **UI**: Hub de conexiones en Ajustes (`IntegrationHub.tsx`) — secciones
  empresa/personales, popup + postMessage + auto-verificación, botón
  Sincronizar, mensaje al tenant sin key ("habla con el operador…").
- **Jobs**: `purge-expired-social-media` (48h, socialTemp-only, paginado),
  `publish-scheduled-social-posts` (*/15), `sync-instagram-metrics` (5:30),
  `sync-tiktok-metrics` (5:45). Disparados por GitHub Actions → `/api/cron`
  cada 5 min (`.github/workflows/trigger-jobs.yml`; alternativa documentada:
  QStash). Botón Sincronizar = mismo runner inmediato.

### Social
- **Publish** Instagram (contenedor→publish, reclamo por estado, errores crudos
  a `lastError`) y TikTok (foto v1; video en adapter `tiktok.ts` sin UI aún).
  Pipeline extraído en `src/lib/social-publish-exec.ts` (`runSocialPublish`) —
  lo usan la action Y el job de programados.
- **Composer** `SocialPostCreateDialog`: pestañas Instagram/TikTok, imagen
  temporal (socialTemp → purge 48h, miniatura 320px sobrevive), Publicar ya /
  Programar.
- **Métricas**: `post-metrics` (compartidas IG/TikTok, `recorded_day` + unique
  tenant+post+día) y `social-account-metrics` (seguidores/día). UI espejo de
  Insights en `/workspace/social` (top posts + seguidores + ER%).
- **Sync multi-tenant**: `sync-email` / `sync-gcal` iteran conexiones `empresa`
  ok (privacidad: personales NO se espejan aún — requiere atribución por
  usuario). Legacy env = fallback del tenant Martes. Adapters:
  `src/integrations/composio/{gmail,gcal}.ts` (mismos shapes que los clients
  env-based).

### OpenBSP (WhatsApp primario — NO tocar sin el usuario)
Flujo: webhook `/webhooks/openbsp` → tenant por org/address → idempotencia →
`upsertConversation` → message → resumen IA encolado → `matchOrCreateLead`
(auto-crea lead + activity). Outbound: `replyConversation` → `message-dispatch`
(`SUPPORTED_CHANNELS`) → OpenBSP. La paridad completa existe: lead auto-creado,
conversaciones almacenadas, sentimiento (summaries), recordatorios
(followups-today). Overrides por tenant (`Tenants.openbsp*`) son opcionales —
el primario es UN número de plataforma.

### Ideas-futuras — inventario
| Doc | Idea | Estado |
|---|---|---|
| 01/06 | Social Hub (publish IG+TikTok, media 48h, espejo Insights, sync Gmail/GCal por conexión) | ✅ construida (#117/#118) — falta activación real |
| 04 | Renovación membresías 1-clic | ❌ por construir (doc completo) |
| 03 | Conversaciones (página espejo sentimiento/temperatura) | ❌ por construir (motor 60%) |
| 02 | Conciliación WhatsApp | ❌ por construir (doc v1 — falta sección Consideraciones) |
| 05 | Conversiones + próximas acciones IA | 📄 investigación; falta elegir modelo (PostHog-embudo vs HubSpot-atribución) |
| 07 | Segundo WhatsApp por Composio al mismo inbox | 📄 documentada hoy |

---

## 2. ACTIVACIÓN EN PRODUCCIÓN (pendiente del usuario — bloquea pruebas reales)

1. Merge #118 (TikTok) y #119 (doc 07) si siguen abiertos.
2. `pnpm migrate` en producción (43 migraciones).
3. Vercel env: `COMPOSIO_API_KEY` (proyecto del operador), `INTEGRATIONS_ENC_KEY`
   (passphrase AES), `TIKTOK_CLIENT_ID/SECRET` (cuando haya app TikTok),
   `S3_*` (ya existen). El `.env` local igual para desarrollo.
4. **Spike real** (go/no-go de publicación):
   `INTEGRATIONS_ENC_KEY=dev COMPOSIO_API_KEY=<key> pnpm tsx scripts/spike-composio.ts instagram`
   → conectar IG → validar contenedor→publish→insights. Luego
   `pnpm tsx scripts/spike-composio.ts tiktok --schema` (imprime el input
   schema REAL de las acciones TikTok — confirmar args del adapter antes de
   publicar de verdad).
5. Conectar el Instagram del negocio (Ajustes → Conexiones) y primer publish.
6. Asignar keys a clientes: `/admin → Integraciones del Tenant` (campo apiKey
   write-only, se cifra en `beforeValidate`).

---

## 3. ROADMAP POR FASES (detalle file-level)

### Fase A — Validación real (primero, bloquea lo demás)
Correr spike → si publish falla con managed OAuth, documentar error exacto y
esperar mejora de Composio (decisión: SIN fallback a Meta). Si pasa: conectar
cuenta real, primer publish, primer sync de métricas.

### Fase B — Idea 04: Renovación 1-clic (~1 día)
- Migración: `payments.membership` (rel) + `payments.renewalKey` (text unique).
- `renewMembershipAction` en `src/lib/membership-actions.ts`: fast-path por
  `renewalKey` → reclamo condicional `update memberships WHERE renewalDate =
  valorViejo` → create payment (amount=monthlyPrice, dueDate=renewalDate VIEJA,
  concept "Renovación {plan}", renewalKey=`{tenant}:{membership}:{YYYY-MM}`) →
  adelantar renewalDate +1 mes (regla de fin de mes testeada) — TODO con `req`.
- Botón "Renovar" en `/workspace/memberships` (fila, admin/editors) +
  revalidatePath.
- Test: doble clic/concurrencia → UN cobro; el perdedor recibe el payment del
  ganador (consulta fresca — NUNCA consultar por un req con transacción
  abortada).

### Fase C — Idea 07: Segundo WhatsApp Composio (~2-3 días)
- Toolkit `whatsapp` en el hub (managed OAuth; scope empresa).
- Endpoint `/webhooks/composio/whatsapp`: firma, rate limit, idempotencia,
  mismo pipeline que OpenBSP (matchOrCreateLead + auto-lead, upsertConversation
  determinista `composio-wa:{waba}:{chat_id}`, channel `whatsapp_composio`,
  resumen IA encolado).
- `message-dispatch.ts`: canal `whatsapp_composio` → `WHATSAPP_SEND_MESSAGE`
  vía sesión Composio del tenant (ventana 24h igual). Fase 2: plantillas.
- Badge de canal en Inbox. Tests del endpoint con fixture.
- Pendiente de investigación: slug/args exactos del trigger entrante de
  Composio (1 trigger en el toolkit — verificar en Context7/dashboard).

### Fase D — Idea 03: Página Conversaciones (~3-4 días)
- `src/lib/conversation-intelligence-data.ts` (patrón `crm-data.ts`:
  overrideAccess:false+user+tenant, select, depth:0).
- `/workspace/conversaciones` + entrada en `WorkspaceSidebar.tsx` (entre Inbox
  y CRM) + badge "sin responder". Motor existente: `computeWindowState`,
  `computeDealVelocity`, summaries (objeciones/nextSteps), `followups-today`.
- Botón Retomar: IA vía `ai-provider.ts` con fallback a `message-templates`;
  CTA wa.me; activity SOLO timeline (la alerta NO se limpia hasta outbound
  real en el espejo OpenBSP).
- Tests de funciones puras sin Postgres (patrón crm-pipeline-window).

### Fase E — Idea 02: Conciliación WhatsApp (~2-3 días)
- ACTUALIZAR el doc primero (añadir sección Consideraciones como los demás):
  webhook `/webhooks/openbsp` (endpoint Payload, no Next route), mensaje
  type=image ya guardado en `messages.content`, job `extract-payment-proof`
  (cola desde el webhook), VLM vía ai-provider, `payments` + `por_confirmar`
  + `sourceMessage` unique + conciliarPagoAction.
- Encaja tras 04: concilia contra los cobros que la renovación genera.

### Fase F — Idea 05: Conversiones + próximas acciones
- Primero DECIDIR modelo con el usuario: A embudo PostHog /
  B atribución HubSpot / mezcla (recomendada). Doc 05 tiene los links.
- Tarjetas próxima acción: motor de señales existentes + redacción IA con
  cache + fallback a plantillas. La IA propone, nunca actúa.

### Cola posterior
- TikTok video (UPLOAD/PUBLISH_VIDEO ya en adapter; falta UI de video +
  schema validado por spike) · sync personal por usuario con atribución ·
  escritura Gmail/Calendar (reply/crear evento) · índice único post-metrics
  ya hecho en #118 · Org Key para auto-provisionar proyectos (solo si Composio
  factura por proyecto algún día).

---

## 4. LECCIONES APRENDIDAS (hotfixes que NO deben repetirse)

1. `Date.now()` real en código testeable = bomba de tiempo → inyectar `now`.
2. 23505 aborta la transacción → el orden de operaciones debe evitar llegar al
   INSERT duplicado (fast-path + claim condicional + consulta fresca del
   ganador); el unique es respaldo fail-closed.
3. Uniques con columnas nullable en Postgres: usar índices parciales.
4. Deduplicar migraciones por (recorded_at, id), no por id solo.
5. Nada del grafo de payload.config importa `server-only`.
6. Errores de proveedor: crudo en BD/logs, sanitizado a UI (200 chars).
7. Conexiones multi-fuente necesitan identidad propia de fuente
   (`appointments.sourceConnection`) — tenant+calendarId no basta.
8. Purga destructiva SOLO sobre assets marcados (`socialTemp`) y con
   paginado completo.
9. Espejos por identidad estable (externalUserId), nunca por connected
   account id (cambia en cada reconnect).
10. Validar el sobre `successful/error` de Composio ANTES de interpretar data.

---

## 5. COMANDOS

```bash
pnpm dev                          # desarrollo
pnpm generate:types               # regenerar payload-types.ts (tras colecciones)
pnpm exec tsc --noEmit            # typecheck
pnpm exec eslint src/             # lint (warnings preexistentes en archivos viejos OK)
pnpm vitest run tests/int/xxx.spec.ts   # spec puntual
pnpm migrate                      # migraciones (scripts/migrate.mjs)
codegraph sync . && codegraph status .
INTEGRATIONS_ENC_KEY=dev COMPOSIO_API_KEY=<key> pnpm tsx scripts/spike-composio.ts instagram [--schema]
```

## 6. AL INICIAR UN CHAT NUEVO (checklist)

1. Lee este archivo completo + `ideas-futuras/README.md` + el doc de la idea a
   trabajar.
2. `git checkout main && git pull` — revisa PRs abiertos (`gh pr list`).
3. `codegraph status .` — índice al día antes de explorar.
4. Carga la skill de Payload y la de Composio (`.agents/skills/composio/`).
5. Consulta Context7/Firecrawl cualquier firma/args/versión antes de codificar.
6. Trabaja en rama → PR → atiende las rondas de Devin → squash-merge.
