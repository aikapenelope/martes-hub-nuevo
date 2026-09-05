# GRILLME — Prompt maestro de auditoría, explicación y refinamiento (Martes Hub)

> Uso: pégalo como instrucción al inicio de una sesión de desarrollo (o conviértelo en un
> comando/slash). Está diseñado para ejecutarse en **modo plan** (solo lectura) y producir
> un corte del estado real del repo: cómo funciona cada cosa, qué mejorar, y un plan
> ejecutable. Mantener este archivo actualizado cuando cambien decisiones cerradas o la
> lista de colecciones/jobs/endpoints.
>
> v2 — añade: explicación funcional de cada subsistema, catálogo de mejoras y extensiones,
> y el escenario multi-número (2 WhatsApp + 1 Instagram) como caso de grilling obligatorio.

---

Actúa como auditor técnico y arquitecto del proyecto **Martes Hub** (Payload 3 + Next.js 16 +
Neon + Vercel, CRM integral multi-tenant). Tu trabajo es GRILLAR el código en tres planos:

1. **EXPLICAR** — cómo funciona cada cosa, en lenguaje claro, con archivo:línea de evidencia.
2. **CRITICAR** — qué está muerto, frágil, duplicado o incompleto.
3. **MEJORAR** — propuestas concretas y ordenadas, incluyendo escenarios de negocio que hoy
   el código NO soporta (ej: dos números de WhatsApp de la misma organización en dos
   workspaces distintos + un Instagram, con todos los mensajes llegando y guardándose bien).

Nada se asume: verifica en el código real antes de afirmar, y cita siempre archivo + línea.

## Fuente de verdad

- `README.md` — tabla de fases + sección "Qué falta para estar LISTO". Señala SIEMPRE cuando
  el README y el código discrepen (ej: pendientes ya resueltos, CI descrito que no existe).
- `docs/WORKSPACE_ARCHITECTURE.md` y `docs/WORKSPACE_UI_SPRINT.md` — sus criterios de
  aceptación son la definición de "terminado".
- `src/payload.config.ts` — colecciones, plugins, jobs, endpoints, config del MCP.
- `docs/GRILLME.md` (este archivo) — decisiones cerradas al final.

## Interrogatorio obligatorio (responde con evidencia: archivo + línea)

1. **Código muerto:** ¿qué archivos/acciones/componentes ya no los importa nadie?
   Método: para cada archivo de `src/lib`, `src/components` y `src/endpoints`, buscar sus
   exportaciones en todo `src/` y `tests/`. Antecedente: `src/lib/copilot-actions.ts` quedó
   huérfano al eliminar CopilotKit (borrado el 2026-09-05, PR #74). Busca más casos y
   propón borrar o reciclar cada uno.
2. **Coherencia README ↔ código:** cada fase marcada ✅ ¿está realmente completa?
   ¿cada pendiente de "Qué falta" sigue pendiente? ¿cada "Resuelto" está resuelto?
3. **Superficies separadas:** ¿`/admin` sigue nativo sin custom views ni CSS propio?
   ¿cada ruta `/workspace/*` exige sesión server-side (`getWorkspaceContext`) y valida
   rol + tenant por operación (`overrideAccess: false` + user)?
4. **Colecciones:** ¿las 28 colecciones registradas están todas conectadas (timeline, joins
   inversos, multi-tenant)? ¿alguna quedó sin usar o duplicando propósito?
5. **Jobs y webhooks:** ¿los 10 jobs de `src/jobs/` son idempotentes, con rate limit y manejo
   de error? ¿los 3 webhooks (openbsp, resend, tally) validan firma/secret?
6. **MCP:** ¿cuál es la superficie actual find/create/update/delete por colección en
   `mcpPlugin`? ¿quién puede emitir API keys (`overrideApiKeyCollection`)? ¿qué falta para
   entregar una key a un agente externo con seguridad (rol/tenant/auditoría de invocaciones)?
7. **IA:** ¿`src/lib/ai-provider.ts` resuelve bien los 4 proveedores y sus fallbacks?
   ¿la `aiApiKey` del tenant sigue en texto plano en `company-settings`? Propón cifrado
   o migración a variables de entorno si lo sigue estando.
8. **Seguridad:** revisa CORS, rate limits, límites de upload (`bodyParser.limits`),
   secretos solo en env, tokens OAuth cifrados. Lista cualquier hallazgo High/Critical.
9. **Deploy:** ¿`pnpm verify` (migrate + build + lint) pasa? ¿migraciones consistentes con
   el esquema? ¿`DATABASE_URL_DIRECT` configurada en Vercel? ¿workflows de GitHub Actions
   sanos (ci.yml + trigger-jobs.yml y su límite de 60 días de inactividad)?
10. **Bloqueos operativos:** credenciales pendientes (OpenBSP, Resend, Tally), PITR de Neon,
    tests de integración/e2e aún fuera del CI.

## Escenario de negocio a grillar (obligatorio mientras esté abierto)

### Multi-número omnicanal: 2 números de WhatsApp de la MISMA organización OpenBSP, cada uno en su propio workspace (tenant) + 1 Instagram

Meta: que los mensajes de ambos números y de Instagram lleguen por el webhook, se guarden
en el tenant correcto, y las respuestas salgan por la cuenta correcta. Verificar en código:

1. **Resolución de tenant ambigua hoy** (`src/integrations/openbsp/webhook-helpers.ts →
   resolveOpenBSPTenant`): matchea PRIMERO por `openbspOrganizationId` y solo después por
   `openbspPhoneNumberId`. Con dos números en la misma organización, TODOS los eventos de la
   org caerían en el primer tenant que tenga ese `openbspOrganizationId`. Además, el fallback
   mono-tenant (si existe exactamente 1 tenant) se vuelve peligroso en cuanto existan 2.
2. **Modelo de direcciones por tenant:** `Tenant` solo tiene `openbspOrganizationId` +
   `openbspPhoneNumberId` (un número), y el id de Instagram vive en el env
   `OPENBSP_INSTAGRAM_ID` (global, no por tenant). Evaluación requerida: ¿una mini-colección
   `openbsp-addresses` (organization_address → tenant + canal + etiqueta) o un array en
   Tenant? La primera opción es la recomendada si cada workspace puede tener varias cuentas.
3. **Prioridad de resolución:** la recomendación a validar es matchear primero
   `organization_address` (el número/cuenta concreto por el que entró el mensaje) y solo
   usar `organization_id` como fallback. Cada workspace configura su número en la misma
   organización OpenBSP; OpenBSP envía todo al mismo webhook y el evento distingue por
   `organization_address`.
4. **Respuestas por la cuenta correcta:** `conversations.organizationAddress` ya guarda por
   cuál cuenta entró cada conversación. Verificar que `replyConversation` y
   `src/integrations/openbsp/client.ts → sendText/sendMedia/sendTemplate` usen SIEMPRE esa
   dirección guardada (el `senderAddress`) y nunca el número de otro workspace — hoy
   `sendText` ya lo hace para instagram_dm, confirmar whatsapp y media/template.
5. **Idempotencia y unicidad:** mensajes idempotentes por `openbspId`/`externalId` dentro del
   tenant; conversaciones upsert por `openbspId` + tenant. Verificar que un mismo contacto
   escribiendo a los DOS números cree DOS conversaciones separadas (una por workspace) y no
   se mezclen leads (el matching por teléfono es por tenant — OK — pero revisar colisiones
   del sufijo de 10 dígitos entre tenants distintos).
6. **Auth del webhook:** un solo `OPENBSP_WEBHOOK_TOKEN` compartido. Con una organización
   OpenBSP es aceptable; documentar la política si algún día hay dos organizaciones.
7. **Criterio de "done" del escenario:** E2E con datos reales — mensaje entrante por el
   número A queda en workspace A, por el número B en workspace B, DM de Instagram queda en su
   workspace con canal `instagram_dm`, y cada respuesta sale desde la cuenta que le corresponde.

## Formato de salida

1. **Cómo funciona cada cosa** — mapa funcional por subsistema, en lenguaje llano (para el
   dueño, no para devs), cada uno con su cadena completa de eventos y archivo:línea:
   - Webhooks (OpenBSP → tenant → conversación → mensaje → lead/cliente → job IA)
   - Jobs (qué dispara cada uno, cada cuándo, qué pasa si falla)
   - Dinero (payment → recordatorio → digest; cotización → factura → PDF → email)
   - IA (config por tenant, copiloto puntual, AI Worker, resúmenes)
   - MCP (qué puede hacer un agente externo, qué no, cómo se emite una key)
   - Workspace (cada módulo: de dónde saca sus datos y qué Server Actions usa)
   - Multi-tenant (cómo se aísla cada workspace y dónde están los bordes débiles)
2. **Corte actual** — features vivas vs muertas (tabla), con rutas.
3. **Hallazgos** — cada uno con severidad (🔴 crítica / 🟡 media / 🟢 menor), evidencia
   (archivo:línea) y acción concreta.
4. **Mejoras propuestas** — para cada subsistema: qué mejorar, por qué, esfuerzo estimado
   (S/M/L) y qué rompería. Incluir SIEMPRE el estado del escenario multi-número (arriba).
5. **Catálogo "¿qué más se puede hacer?"** — 5-8 extensiones de alto valor con el código
   existente que las soporta (ej: encuestas post-venta vía plantillas, reasignación de
   conversaciones entre agentes, SLA de primera respuesta, reporte semanal por email,
   búsqueda semántica de conversaciones con embeddings).
6. **Decisiones requeridas** — lista corta de preguntas de sí/no para el dueño.
7. **Plan del sprint** — máximo 5 tareas ordenadas por impacto, cada una con criterio
   de "done" verificable (comando o test que lo demuestra).
8. **Score 1–10** — en cuatro ejes: listo para operar · UI completa · robustez de los
   sistemas Payload (comunicación + fragilidad) · API/MCP. Con justificación de 1 línea.

## Reglas

- No propongas infraestructura nueva sin evidencia de un límite real (ver sección
  "Capacidad" de WORKSPACE_ARCHITECTURE.md).
- Respeta las decisiones cerradas (abajo). Si crees que una debe revisarse, elévala como
  decisión requerida, no la contradigas en el plan.
- El repo trabaja con PRs a `main` (nunca push directo) y `pnpm verify` antes de cada push.
- Las explicaciones del punto 1 deben poder leerlas personas no técnicas: nada de jerga sin
  traducir.

## Decisiones cerradas (no re-abrir, solo registrar desviaciones)

- **Publicación social:** NUNCA construir conector propio a la Graph API de Meta. Este sistema
  solo planifica (`social-posts`); la publicación real la hace un agente MCP externo conectado
  además al MCP de Metricool o Composio.
- **F6 Apify (scraping de leads):** descartada. Import manual CSV/JSON con plugin oficial.
- **CopilotKit:** eliminado. La IA in-app es solo el copiloto puntual (resumen de conversación)
  + AI Worker de fondo (`summarizeConversation`/`sweepConversations`); toda automatización
  abierta va por agentes MCP externos en `/api/mcp`.
- **MCP:** ningún agente externo puede borrar registros de negocio (`delete: false` en todas
  las colecciones expuestas); API keys solo las emite un admin.
- **Infraestructura:** OpenBSP solo en modo hosted (REST + webhook, cero acceso a su Supabase).

## Decisiones abiertas (resolver en la próxima sesión GRILLME)

- **Multi-número por organización:** definir el modelo de mapeo `organization_address →
  tenant` (mini-colección `openbsp-addresses` recomendada) y la prioridad de resolución
  (address antes que org). Ver sección "Escenario de negocio a grillar".
