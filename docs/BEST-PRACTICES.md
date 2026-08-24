# Manual de Buenas Prácticas — Martes Hub

> **LEER ANTES DE TOCAR CUALQUIER CÓDIGO.** Este manual protege la integridad del
> sistema. Cualquier sesión/agente debe consultarlo al inicio y el checklist final
> antes de abrir un PR. Fuentes oficiales descargadas en `docs/payload-sdk/`
> (SKILL.md de Payload + 11 documentos de referencia, ~6.800 líneas).

---

## 1. Las 5 reglas base — validadas contra docs oficiales y el monorepo

### Regla 1: Todo por hooks / endpoints custom / Local API. Jamás BD directa ✅ CORRECTA

Confirmada por la documentación y por cómo está escrito el propio `plugin-stripe`
oficial (el ejemplo canónico de integración externa):

- Los datos se leen/escriben con la **Local API** (`req.payload.find/create/update/delete`)
  — ver `docs/payload-sdk/reference/QUERIES.md`.
- Las integraciones externas entran por **hooks** (`beforeValidate`, `beforeChange`,
  `afterDelete`) y **endpoints** propios — patrón completo en
  `reference/PLUGIN-DEVELOPMENT.md` y en `packages/plugin-stripe/src/index.ts`.
- SQL/Drizzle crudo que se salte Payload rompe versiones, hooks, control de acceso,
  transacciones y migraciones. Prohibido.
- **Matiz oficial**: en scripts standalone sí existe `payload.db.beginTransaction()`
  para transacciones manuales (`docs/database/transactions.mdx`), pero las operaciones
  siguen siendo Local API pasando `{ req: { transactionID } }`. Dentro de hooks, pasar
  siempre `req` a las llamadas para heredar la transacción del request (atomicidad).

**En este proyecto**: los jobs usan `req.payload.jobs.queue()` desde hooks; OpenBSP/
Apify/Tally/GCal solo tocan endpoints custom; Hermes solo toca el plugin MCP; ninguna
pieza habla con Postgres directamente.

### Regla 2: Pinnear versiones + leer changelog antes de cada bump ✅ CORRECTA

- Payload sigue **semver estricto**: los breaking changes van a majors y existen guías
  de migración por versión (`docs/migration-guide/`). Los minors de 3.x han sido
  mayormente aditivos (p. ej. v3.85: admin, rich text, extensibilidad).
- Práctica obligatoria aquí: `package-lock.json` commiteado, actualizaciones una a una
  leyendo el release notes correspondiente (`gh release view vX.Y.Z -R payloadcms/payload`),
  nunca `pnpm update` ciego de todo el árbol.

### Regla 3: Componentes admin custom — pocos y superficiales ✅ CORRECTA

Es el dolor real reportado por la comunidad: los componentes custom (`admin.components.*`,
vistas propias) consumen internals de `@payloadcms/ui` que cambian entre minors, sin
garantía semver. Reglas derivadas:

- Preferir lo nativo (listas, filtros, campos) antes que vistas custom.
- Lo mínimo indispensable ya planificado: kanban de tareas, calendario de citas,
  dashboard "Hoy", inbox. Cada uno aislado en su carpeta con su propio contrato de datos
  (que dependa de la REST/Local API, no de internals de React de Payload).
- Antes de escribir un componente custom, revisar si un plugin mantido ya lo resuelve
  (ver README → plugins).
- Tras cualquier bump de minor, verificar primero las vistas custom.

### Regla 4: Auth completarla tú — pieza débil ⚠️ CORRECTA EN ESPÍRITU, MATIZADA

- La auth **local** de Payload (email+password, cookies httpOnly firmadas con
  `PAYLOAD_SECRET`, reset/verify incluidos) es sólida y basta para equipo interno.
  No hay que reinventar refresh tokens: eso ya lo resuelve el mecanismo nativo.
- Lo genuinamente débil es **OAuth social/OIDC**: depende de plugins comunitarios
  (`payload-oauth2` 197★, `payload-authjs` 206★, better-auth 331★). Si algún día se
  necesita OAuth, encapsularlo detrás de nuestra propia estrategia y no regar sus
  tipos por todo el código.
- Decisión vigente: auth local + **TOTP 2FA (`payload-totp`, 158★)** en F10. Contraseñas
  fuertes exigidas por política; secrets jamás en código.

### Regla 5: Cuando salga 4.0 estable, NO migrar día 1 ✅ CORRECTA

- Ya existe `docs/migration-guide/v4.mdx` en el repo oficial: v4 está en camino.
- Política: esperar ≥4–6 semanas tras el anuncio de estable, confirmar que TODOS los
  plugins que usamos (mcp, import-export, storage, totp, reserve/appointments…) publiquen
  compatibilidad, migrar en rama dedicada con backup PITR previo, y leer la guía completa
  (ya se sabe que cambia `LinkProps` → `LinkAdapterProps`, entre otros).

---

## 2. Reglas de oro del proyecto (específicas de Martes Hub)

### Datos y esquema
1. Toda colección nueva pasa por: campos → access control por rol → hooks necesarios →
   timestamps. Nada se crea "temporalmente" sin access control.
2. Producción SIEMPRE `push: false` con migraciones versionadas (`payload migrate`);
   desarrollo puede usar push. Ver `reference/ADAPTERS.md`. Nunca editar una migración
   ya aplicada: se crea otra encima.
3. `payload generate:types` después de cambiar campos; nunca editar `payload-types.ts`.
4. Relaciones por `relationship` fields, nunca IDs guardados como texto suelto.
5. Dinero: enteros de unidades menores o decimal fijo, USD, sin floats.

### Integraciones externas
6. Todo webhook entrante verifica firma ANTES de parsear el body
   (Meta: `x-hub-signature-256`; Tally: HMAC; Apify: token secreto en URL/header).
7. Toda llamada saliente va en `src/integrations/` con timeout, reintentos con backoff
   y logging estructurado. Ninguna integración se escribe inline en un endpoint.
8. Tokens OAuth (Meta, Google) cifrados en reposo en `social-accounts`; job de refresco
   antes de expiración (~día 55 de 60); alerta si falla el refresh.
9. Opt-out de mensajería se respeta en TODO canal automático (jobs incluidos): chequeo
   obligatorio antes de enviar.

### Jobs y colas
10. Operaciones largas dentro de hooks se delegan a `req.payload.jobs.queue()`
    (patrón oficial de `hooks/overview`). Un hook nunca llama APIs lentas en línea.
11. Todo job es idempotente: si se ejecuta dos veces no duplica efectos
    (dedupe por claves naturales: teléfono, message_id de Meta, run_id de Apify).

### Admin y UX
12. Español en toda la UI del admin; fechas/horas en `America/Caracas`; moneda USD.
13. Componentes custom mínimos (regla 3) y aislados en `src/admin/`.

### Seguridad
14. Secretos solo en env (Vercel / `.env` local ignorado por git). Nunca en logs.
15. Access control default-deny: si no hay regla explícita para un rol, no puede.
16. Antes de cerrar cambios sobre auth/datos sensibles/webhooks: correr revisión con
    subagente security-auditor.

## 3. Checklist pre-PR (obligatorio)

- [ ] ¿Leí este manual? ¿La pieza respeta la Regla 1 (sin BD directa)?
- [ ] `pnpm typecheck` y `pnpm lint` sin errores (comandos reales definidos en F0)
- [ ] Si toqué colecciones/campos: migración generada + `generate:types` corrido
- [ ] Si toqué webhooks/jobs: probado idempotencia y firma inválida rechazada
- [ ] Si toqué componentes admin custom: verificado contra la versión actual de Payload
- [ ] Sin secretos en código, logs ni fixtures commiteados
- [ ] Commits convencionales, PR describiendo el "done when" verificable
- [ ] Cambios de complejidad media/alta: pasada de code-reviewer

## 4. Referencias oficiales locales (usar como fuente primaria)

| Archivo | Contenido |
|---|---|
| `docs/payload-sdk/SKILL.md` | Guía maestra oficial para agentes que construyen con Payload |
| `reference/QUERIES.md` | Local API: find/create/update/delete/count |
| `reference/HOOKS.md` | Orden y patrones de hooks |
| `reference/COLLECTIONS.md` | Config de colecciones, uploads |
| `reference/FIELDS.md` · `FIELD-TYPE-GUARDS.md` | Tipos de campo y guards |
| `reference/ACCESS-CONTROL.md` (+ADVANCED) | RBAC y filtros de acceso |
| `reference/ENDPOINTS.md` | Endpoints custom y webhooks |
| `reference/ADAPTERS.md` | DB adapters, migraciones, storage |
| `reference/PLUGIN-DEVELOPMENT.md` | Escribir plugins (1.400 líneas, incluye webhook pattern) |
| `reference/ADVANCED.md` | Plugins disponibles, jobs queue, email |

Actualizar estos archivos con: `git checkout main && pnpm dlx` no aplica — se
re-sincronizan copiando desde `payloadcms/payload@main/packages/payload/skills/`
cuando subamos de versión.
