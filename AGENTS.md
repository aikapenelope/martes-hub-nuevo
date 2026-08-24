# AGENTS.md — Martes Hub

Instrucciones obligatorias para cualquier agente/sesión que trabaje en este repo.

## Antes de tocar código

1. **Leer `docs/BEST-PRACTICES.md` completo** — manual de buenas prácticas validado
   contra los docs oficiales. Contiene las reglas de oro del proyecto y el checklist
   pre-PR obligatorio.
2. **Cargar la skill `payload`** (herramienta `skill`) al iniciar cualquier tarea de
   código — está instalada a nivel global (`~/.config/opencode/skills/payload`) y en
   el proyecto (`.opencode/skill/payload`). Es la referencia oficial de Payload para
   agentes: usarla como fuente primaria de APIs antes que memoria o suposiciones.
3. Contexto de producto y sprints: `README.md`.

## Reglas no negociables

- **Datos**: solo Local API / hooks / endpoints custom / plugin MCP. PROHIBIDO SQL
  directo a Neon saltándose Payload.
- **Versiones**: package-lock commiteado; bumps uno por uno leyendo release notes.
  Payload 3.x — NO migrar a v4 sin aprobación explícita (ver BEST-PRACTICES regla 5).
- **Admin UI**: componentes custom mínimos y aislados en `src/admin/`.
- **Auth**: local + TOTP. Sin OAuth improvisado.
- **Secrets**: solo variables de entorno. Nunca en código, logs ni fixtures.
- **Webhooks**: verificar firma antes de parsear el body.
- **Idioma**: comunicación con el dueño en español; UI/admin en español;
  zona horaria America/Caracas; moneda USD.

## Flujo Git

- Tras el README inicial: TODO entra por PR. Nadie mergea directo a `main`
  (el merge lo hace el dueño).
- Commits convencionales: `type(scope): descripción`.
- Identidad git: `AngelDelN <57774536+aikapenelope@users.noreply.github.com>`.
- Verificación mínima antes de PR: typecheck + lint del repo sin errores.

## Stack

Payload 3 · Next.js · TypeScript estricto · Neon Postgres (`@payloadcms/db-postgres`,
push:false + migraciones) · Vercel · pnpm.
