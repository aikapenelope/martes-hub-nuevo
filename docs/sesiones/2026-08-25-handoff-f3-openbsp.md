# Handoff — iniciar AQUÍ en una sesión nueva (2026-08-25, post F3b/c)

> Para retomar: pídele al agente leer este archivo completo primero.

## Proyecto
Martes Hub — CRM sobre **Payload 3.88 + Next 16 + Neon Postgres + Vercel**.
Repo: `aikapenelope/martes-hub-nuevo`. Código local: `~/martes-os`.
Plan maestro de fases: `README.md` · Plan OpenBSP: `docs/plan-openbsp.md`.

## Dónde estamos exactamente
- **F0–F2**: mergeadas y desplegadas en producción (Vercel proyecto `martes-hub-nuevo`, cuenta angelpdi100-9571).
- **PR #10 ABIERTO**: F3b+c integración OpenBSP completa (cliente PostgREST, webhook receptor con idempotencia/estados/ecos/matching, endpoint reply con ventana 24h, vista `/admin/inbox` dentro del admin). Build arreglado (guard `selected` en Inbox.tsx) — al pushear este commit Vercel re-despliega el preview solo.

## Lo SIGUIENTE (en orden)
1. **Merge del PR #10** (usuario). Verificar preview verde en Vercel.
2. **F3d** — sin credenciales aún:
   - Job diario `syncTemplates`: `listTemplates()` de `src/integrations/openbsp/client.ts` → upsert en `message-templates`
   - Job poll de `logs` (`level=error`) de OpenBSP → notificación interna
   - Enriquecimiento contactos: webhook `contacts` hoy devuelve `ignored` — implementar matching hacia clients/leads
3. **Conexión real OpenBSP hosted** cuando el usuario lo decida:
   - Usuario crea org en web.openbsp.dev, conecta número, crea API key rol admin
   - Pasar al agente: `OPENBSP_API_KEY`, `OPENBSP_PUBLISHABLE_KEY` (público), Organization ID, Phone Number ID
   - Agente configura env vars (local `.env` + Vercel) y registra webhook en dashboard apuntando a `https://<prod>/api/webhooks/openbsp` con `OPENBSP_WEBHOOK_TOKEN` (ya generado en `.env` local)
   - E2E real: WhatsApp del usuario ↔ CRM
4. Después: **F4 IA proactiva** (sequences, lead-follow-up, summaries con pgvector ya activado).

## Deudas / pendientes arrastrados
- PR #2 abierto (README viejo): su merge REVERTIRÍA decisiones nuevas → cerrarlo o rehacer rama
- "Roadmap V3" del usuario nunca apareció en el repo — preguntar dónde quedó
- Revocar API key vieja de Neon (`napi_…`) en console.neon.tech
- CI GitHub Actions (typecheck+lint): pospuesto explícitamente por el usuario
- Lint warnings heredados (~32) acumulados — limpiar oportunamente

## Convenciones críticas
- Commits convencionales; PRs obligatorios; NUNCA mergear (solo el dueño)
- Git identity local: `AngelDelN <57774536+aikapenelope@users.noreply.github.com>`
- Node ≥24.15: `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH" && hash -r`
- Migraciones: `pnpm migrate:create <nombre>` (wrapper usa URL directa); prompts interactivos de drizzle → usar `expect` con script tipo `/tmp/opencode/f3a.exp`; después `pnpm migrate`
- Tras tocar colecciones: `pnpm generate:types` → migración → typecheck/lint → smoke `/admin` y/o `/admin/inbox`
- Webhook OpenBSP: Bearer `OPENBSP_WEBHOOK_TOKEN` (en `.env` local, NO commiteado)
- MCP activos en opencode: Context7, Supabase, **Neon** (proyecto `martesapp` = `rapid-bonus-33572154`, DB `neondb`, pgvector ON)
- Usuario responde en español; respuestas concisas
