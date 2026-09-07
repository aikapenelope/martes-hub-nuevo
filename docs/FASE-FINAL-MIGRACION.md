# Fase Final — Limpieza de la base y migración a datos reales

> Estado: PLAN APROBADO (pendiente de ejecución). Este documento anota todo lo
> acordado para el paso final: dejar la base en cero (sin datos mock), subir la
> información real (~2.500 leads nuevos + ~2.800 contactos) y arrancar
> operación con el equipo y el agente MCP.
>
> **Prerrequisito único:** merge de PR #86 (migración faltante de
> `paymentMethods` + fix del build). Sin él, el deploy de Vercel no sale y la
> BD de producción no recibe las migraciones pendientes.

## 0. Diagnóstico del fallo "Algo falló al cargar esta vista" (CRM / Facturación)

Documentado para que quede registro de qué pasó y cómo se resolvió:

1. **`next build` roto en main** (desde el merge del #85): `whiteboard-actions.ts`
   es archivo `'use server'` y exportaba la constante `MAX_ELEMENTS` — Next
   prohíbe exports no-async ahí, el módulo quedaba sin exports y el build moría
   ("The module has no exports at all"). Consecuencia: ningún deploy salió desde
   el #85 y `prodMigrations` nunca corrió en producción.
   **Fix:** PR #86 — la constante vive en `collections/Whiteboards.ts`.
2. **Facturación caída en todos los entornos**: el grupo `paymentMethods`
   completo (pago móvil, transferencia Bs, Zelle, Binance, SWIFT — 15 columnas)
   se añadió a `CompanySettings` en el #82 **sin migración**. Todo `SELECT` de
   `company-settings` fallaba ("column does not exist") y la página devolvía el
   error boundary. **Fix:** PR #86 — migración `add_payment_methods_columns`
   con `IF NOT EXISTS`, aplicada y verificada con smoke runtime.
3. **CRM**: el código pasa limpio sobre esquema completo (verificado con seed).
   El fallo en la instancia en vivo era **drift de esquema** (migraciones
   pendientes sin aplicar). Se cura con `prodMigrations` en el próximo deploy
   exitoso, y de raíz con el reset del Sprint 1.

Lección aplicada: los errores de este tipo no los levantan `tsc` ni los tests
mock — el runbook del Sprint 4 incluye un `next build` local antes de cada
deploy y el smoke de rutas contra BD real.

## Sprint 1 — Reset total: base en cero, sin datos mock

**Decisión:** el reset es destruir el esquema y reaplicar migraciones (las
migraciones son la fuente de verdad del esquema), no borrar documento por
documento (deja huellas: versiones, jobs encolados, IDs no reiniciados).
**Sin dump previo: decidido — dentro no hay nada que conservar.**

### Runbook

```bash
# 1. Respaldo operativo mínimo (opcional, por cortesía operativa — NO es el dump plan)
# 2. Reset (local, apuntando a la DATABASE_URL de producción con sslmode=require):
psql "$DATABASE_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
pnpm payload migrate        # reaplica las ~31 migraciones → esquema exacto y limpio

# 3. Primer acceso: /admin crea el usuario super-admin (Payload lo solicita solo)
# 4. Desde /admin → Tenants: crear el tenant real (solo super-admin puede)
# 5. Desde /admin → Users: crear los usuarios del equipo con membresía al tenant real
```

**Criterio de aceptación:** todas las tablas de negocio en 0 filas, esquema =
migraciones, un solo admin, cero tenants de prueba.

## Sprint 2 — Importador nivel producción (upsert + mapeo + lotes)

El importador actual (`/api/import-csv`, UI en `CrmImportExportDialog`) solo
crea y salta duplicados. Cambios:

1. **Modo upsert** (`mode=create|upsert`, default `upsert`): match por email
   normalizado o teléfono (solo dígitos) dentro del tenant; si existe →
   actualiza los campos presentes en el CSV; si no → crea.
2. **Normalización**: emails en minúsculas, teléfonos a dígitos, trim — tanto
   en la comparación como al guardar. (Con la base en cero, el problema de
   dedupe case-sensitive desaparece de raíz.)
3. **Mapeo extendido** a las columnas reales del esquema:
   - Leads: `fullName`, `companyName`, `position`, `city`, `state`, `address`,
     `socialHandle`, `estimatedValue`, `commercialNotes`, `notes`, `segment`
     (por nombre), `assignedTo` (por email del agente), `source` (9 valores del
     enum), `status`.
   - Clients: `name`, `companyName`, `taxId`, `city`, `state`, `address`,
     `segment`, `stage`, `email`, `phone`.
4. **Lotes**: tope sube a 5.000 filas por import; dedupe con una sola query
   `IN (...)` por lote (hoy: 2 queries por fila); reporte final
   `created / updated / issues` por número de fila.
5. **Tests int** con el patrón mock del repo (hoy el importador no tiene
   ninguno): upsert crea/actualiza, dedupe, filas inválidas no abortan el
   lote, tenant scoping.

**Criterio de aceptación:** CSV de 2.500 filas en una pasada con reporte
correcto; segunda pasada = 0 created, solo updated.

## Sprint 3 — Switches de operaciones (nada le escribe a clientes sin permiso)

1. **`PAYMENT_REMINDERS_ENABLED` (default `false`)** en `payment-reminders`
   (corre diario 12:00 Caracas y **envía emails reales** a clientes con cobros
   que vencen mañana — hoy no tiene apagador).
2. Revisión de gates equivalentes: `dailyDigest` (emails internos, horario),
   `summarizeConversation` / `sweepConversations` (consumo de IA por
   conversación), `syncEmail` / `syncGcal` (requieren credenciales Google).
   Flags `OPS_*` documentados en `.env.example`.
3. `EMAIL_CAMPAIGNS_AUTO_SEND=false` al arranque (ya existe).
4. Sección "Go-live switches" en el README: qué encender y en qué orden.

**Criterio de aceptación:** con flags en default, la base con datos reales y
cobros vencidos no dispara ningún mensaje.

## Sprint 4 — Carga real validada y arranque

1. Import **piloto**: 10 filas reales → verificar upsert/dedupe/mapeo.
2. Import completo (leads + contactos) → revisar `created/updated/issues`
   contra el CSV.
3. **Prueba de fuego** del flujo comercial con un lead real: llamada →
   actividad → WhatsApp/Email → conversión a cliente.
4. **MCP bidireccional operativo**: API key desde `/admin` (solo admin puede
   emitirlas), conexión de Claude/Cursor vía `mcp-remote
   https://<dominio>/api/mcp` con `Authorization: users API-Key <key>`.
   El plugin expone por colección: `find` (where + select), `create`,
   `update`, `delete` y `getCollectionSchema` (esquema estructurado) —
   la configuración actual ya es bidireccional en clients/leads/tasks y
   solo-lectura en pagos/facturas (correcto). Opcional: custom tools
   (`defineCollectionTool`) para operaciones de negocio.
5. Encender los switches del Sprint 3 uno a uno.

**Criterio de aceptación:** equipo operando con datos reales, jobs activos
bajo control, agente IA consultando y escribiendo el CRM.

## Notas de entorno

- **Neon (plan Free)**: el volumen real son decenas de MB — cabe holgado. La
  ventana de PITR del plan Free es corta (horas): tras la carga real, conviene
  activar backups propios periódicos (backlog, no bloqueante).
- **Vercel**: `prodMigrations` ya configurado (PR #85) — las migraciones
  pendientes se aplican al inicializar el server en producción. Verificar en
  los logs del deploy que no hubo errores de migración.
- **Escala**: índices en email/teléfono de leads/clients, paginación en todas
  las listas, SQL de agregados tenant-scoped. El Kanban muestra máx. 240
  tarjetas (por diseño); la tabla pagina todo.
