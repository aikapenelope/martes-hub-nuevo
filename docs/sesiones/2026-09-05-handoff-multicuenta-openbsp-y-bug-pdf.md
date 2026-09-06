# Handoff 2026-09-05 — Multi-cuenta OpenBSP (Opción A) + veredicto billing + bug PDF

## Contexto

Sesión de cierre con tres hilos: (1) definir la arquitectura OpenBSP para el escenario
**hasta 3 números de WhatsApp de la MISMA organización + Instagram**, (2) verificar la
conexión backend de la facturación, (3) aclarar el rol de Tally. Decisión del dueño:
**Opción A — todo en el mismo workspace** (mono-tenant), sin colección `openbsp-addresses`.

## 1. Multi-cuenta OpenBSP — decisión y estado

- **Decisión cerrada:** un solo tenant de Martes Hub; los 3 WhatsApps + Instagram viven en
  la misma organización OpenBSP y en el mismo workspace. La colección `openbsp-addresses`
  (doc GRILLME.md, "decisión abierta") **no se implementa** — solo sería necesaria si algún
  día se quisiera un workspace distinto por número.
- **Entrantes:** ya quedan separados sin cambios — cada conversación guarda `channel`
  (whatsapp / instagram_dm / whatsapp_web) y `organizationAddress` (el número que recibió)
  en `upsertConversation` (`src/integrations/openbsp/webhook-helpers.ts:179-183`).
- **Salientes — corregido en esta sesión** (el Inbox ya lo hacía bien vía
  `replyConversationAction`, `src/lib/inbox-actions.ts:204-210`):
  - `src/lib/crm-pipeline-actions.ts` (chat rápido del drawer del pipeline): ahora enruta
    por canal (`whatsapp`/`instagram_dm`, rechaza otros) y envía con
    `senderAddress: conversation.organizationAddress`.
  - `src/endpoints/replyConversation.ts` (endpoint REST, mismo criterio, con error 422 en
    canales no soportados).
- **Credenciales (para el dueño):** con la API key de OpenBSP basta una llamada para
  obtener Org ID y los phone_number_ids:
  `GET /rest/v1/organizations_addresses?select=organization_id,service,address,status,extra`
  contra `https://<HOSTED_SUPABASE_HOST>` (constante pública, ya default en
  `src/integrations/openbsp/client.ts:7`). Ver `docs/plan-openbsp.md` e INTEGRATING.md.
- **Vercel:** las 35 variables del `.env.example` ya existen en el proyecto
  `martes-hub-nuevo` (verificado con `vercel env ls`). Falta solo actualizar valores
  OpenBSP cuando se conecten los números reales.

## 2. Billing — veredicto

**El backend SÍ está conectado.** Verificado E2E con Postgres local real: migraciones
completas, login OK, `GET /workspace/billing` → 200 con las 4 tarjetas KPI renderizando.
Las colecciones `quotes`/`invoices` las inyecta el plugin `payload-invoicepdf`
(`src/payload.config.ts:148`, `invoicePdf({...})`), están en el mapa del multiTenantPlugin
(líneas 187-188) y expuestas al MCP en solo-lectura (líneas 233-250). El build de Vercel
corre migraciones (`vercel.json`: `pnpm migrate && pnpm build`).
Si en producción se ve vacío, es falta de datos, no de conexión.

## 3. Bug pre-existente documentado: PDF de cotizaciones/facturas 🔴

**Síntoma:** 7 tests de integración del ciclo comercial fallan contra Postgres real
(`tests/int/billing-lifecycle.int.spec.ts` — 4 y `tests/int/offers-billing-cashboard.int.spec.ts`
— 3, incluido el Cashboard cuyo setup crea cotizaciones). No afectan la página de billing
ni los datos existentes; afecta la **creación de cotizaciones/facturas nuevas** si el hook dispara.

**Causa raíz (verificada con debug):** el hook `generate-pdf` de `payload-invoicepdf@1.0.0`
(`node_modules/payload-invoicepdf/src/hooks/generate-pdf.ts`) tras crear/editar un
quote/invoice genera el PDF y lo guarda en `media`. El create del media falla con
`ValidationError: Could not read uploaded file for type detection`
(`payload/dist/uploads/checkFileRestrictions.js`), y luego la actualización de
`generatedPdfs` del documento falla con `"This field has the following invalid selections: N"`
(referencia a un media que no persistió). Ejemplo real en DB local: quote COT-2026-0004
creó media 1 (`COT-2026-0004.pdf`) pero la cadena completa quedó rota.

**Pistas para el arreglo:** puede ser incompatibilidad del plugin 1.0.0 con payload 3.88
(restricciones de upload en `checkFileRestrictions`) o falta de storage local/S3 en el
entorno de tests. Opciones: (a) hacer el hook no-fatal (try/catch alrededor del
`beforeChange` del plugin vía wrapper propio), (b) generar PDFs bajo demanda en vez de
automático, (c) actualizar el plugin. Verificar contra S3/R2 real antes de decidir.

## Verificación de esta sesión

- `pnpm typecheck` ✅ · `pnpm lint` ✅ (0 errores; 8 warnings pre-existentes)
- Suite de integración contra Postgres real: 170/176 ✅ — los 6 fallos son el bug del PDF
  documentado arriba (pre-existentes, sin relación con los cambios de esta sesión).

## Pendiente inmediato

1. Conectar OpenBSP real (API key del dueño → curl → cargar Org ID / números en Vercel y
   en el tenant) y registrar el webhook en el dashboard de OpenBSP.
2. Arreglar el bug del PDF (opciones arriba) para poner los 6 tests en verde.

## 4. Extra de esta sesión: credenciales OpenBSP reales cargadas + módulo Notas

**OpenBSP en Vercel** (Production/Preview/Development, vía CLI + API REST):
`OPENBSP_API_KEY`, `OPENBSP_PUBLISHABLE_KEY`, `OPENBSP_ORG_ID`
(= `<OPENBSP_ORG_ID>`, obtenido vía
`GET /rest/v1/organizations_addresses`) y `OPENBSP_WEBHOOK_TOKEN` (regenerado — el
anterior estaba vacío y el endpoint habría respondido 503). El webhook de `messages`
(insert/update) lo registró el dueño desde el dashboard (el INSERT por REST choca con
RLS de la instancia hosted — probado con clave admin, error 42501). Pendiente: conectar
el número de WhatsApp (aún no aparece en `organizations_addresses`) → fijar
`OPENBSP_PHONE_NUMBER_ID` real + redeploy + E2E. Contactos de WhatsApp: no descargables
por diseño de Meta; vía CSV ya soportado + auto-creación de leads + `enrichContact`.

**Módulo Notas** (nuevo, decisión del dueño):
- Colección `src/collections/Notes.ts`: título + cuerpo **Lexical richText** (bold,
  italic, underline, inline code, links, h2/h3, blockquote, listas, checklist, hr,
  toolbar fija+inline), categoría select, pinned, client/lead opcionales, author
  auto-fill. Registrada en multiTenantPlugin. RBAC: read authenticated, create/update
  editors, delete admin-only.
- Página `/workspace/notes`: PageHero + búsqueda por título + chips de categoría +
  filtro "solo fijadas"; sección Fijadas y grid de tarjetas; render del cuerpo con
  `RichText` + `defaultJSXConverters` (`@payloadcms/richtext-lexical/react`); acciones
  pin (server action), eliminar (admin) y "Editar" → `/admin/collections/notes/[id]`
  (editor completo). Quick-create dialog con Server Action (`notes-actions.ts`,
  `buildLexicalFromPlainText` convierte texto plano → Lexical JSON).
- Nav: entrada en WorkspaceHeader (primaria + secundaria) y CommandPalette.
- Migración `20260906_025046_add_notes_collection` (tabla notes + enum + índices +
  `payload_locked_documents_rels.notes_id`). NOTA: el diff automático de
  `migrate:create` salió contaminado (incluía tablas ya existentes) y se reescribió a
  mano con CREATE IF NOT EXISTS / DO $$ guards.
- Verificación: typecheck ✅, lint ✅ (0 errores), suite 178→186 pasando
  (`notes.int.spec.ts` 8/8 ✅), E2E real con Postgres local: nota creada vía Local API
  y renderizada en `/workspace/notes` (200, cuerpo con negrita renderizado). Los 6
  fallos restantes siguen siendo exclusivamente el bug del PDF (punto 3).

