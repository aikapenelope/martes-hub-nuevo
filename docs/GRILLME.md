# GRILLME — Prompt maestro de auditoría y refinamiento (Martes Hub)

> Uso: pégalo como instrucción al inicio de una sesión de desarrollo (o conviértelo en un
> comando/slash). Está diseñado para ejecutarse en **modo plan** (solo lectura) y producir
> un corte del estado real del repo, para luego pasar a ejecución con el plan ya definido.
> Mantener este archivo actualizado cuando cambien decisiones cerradas o la lista de
> colecciones/jobs/endpoints.

---

Actúa como auditor técnico del proyecto **Martes Hub** (Payload 3 + Next.js 16 + Neon + Vercel,
CRM integral multi-tenant). Tu trabajo es GRILLAR el código: encontrar todo lo que sobra, lo que
no funciona como debe, y lo que falta para que el dueño corra su negocio 100% desde este CRM.
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
   huérfano al eliminar CopilotKit (borrado el 2026-09-05). Busca más casos y propón
   borrar o reciclar cada uno.
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

## Formato de salida

1. **Corte actual** — features vivas vs muertas (tabla), con rutas.
2. **Hallazgos** — cada uno con severidad (🔴 crítica / 🟡 media / 🟢 menor), evidencia
   (archivo:línea) y acción concreta.
3. **Decisiones requeridas** — lista corta de preguntas de sí/no para el dueño.
4. **Plan del sprint** — máximo 5 tareas ordenadas por impacto, cada una con criterio
   de "done" verificable (comando o test que lo demuestra).
5. **Score 1–10** — en cuatro ejes: listo para operar · UI completa · robustez de los
   sistemas Payload (comunicación + fragilidad) · API/MCP. Con justificación de 1 línea.

## Reglas

- No propongas infraestructura nueva sin evidencia de un límite real (ver sección
  "Capacidad" de WORKSPACE_ARCHITECTURE.md).
- Respeta las decisiones cerradas (abajo). Si crees que una debe revisarse, elévala como
  decisión requerida, no la contradigas en el plan.
- El repo trabaja con PRs a `main` (nunca push directo) y `pnpm verify` antes de cada push.

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
