# Arquitectura del Martes Workspace

## Propósito y estado

Martes Hub tiene dos superficies **totalmente separadas** dentro de la misma aplicación Next.js:

- `/admin`: backoffice técnico **nativo de Payload, sin modificar**. No registra custom views, no agrega enlaces de navegación (`admin.components` está vacío) ni carga CSS propio (`src/app/(payload)/custom.css` está vacío). Sirve exclusivamente para administrar colecciones, usuarios, tenants y configuración de bajo nivel — tal cual lo genera el scaffold de Payload.
- `/workspace`: producto operativo para el equipo. Vive en `src/app/(workspace)/workspace/...` (route group `(workspace)` + segmento real `workspace`, necesario porque los route groups no aparecen en la URL y `/workspace` debe coexistir con la raíz `/` de `(frontend)`). Tiene su propio root layout (`src/app/(workspace)/layout.tsx`) con su propio `<html>`/`<body>`, independiente del admin.

Cada superficie tiene su propia UI: el admin usa los componentes nativos de Payload; el workspace usa una UI propia estilo **Storelink** (fondo negro, tipografía mono en mayúsculas, tarjetas con borde `zinc-800`, nav superior en pills) construida con Tailwind v4, ya adoptada primero en el dashboard de analítica y ahora extendida a todos los módulos.

Ambas superficies comparten Payload, la sesión `payload-token`, Neon Postgres, colecciones, permisos e integraciones — pero no comparten shell, estilos ni navegación. El workspace no es una vista dentro del admin ni depende de sus componentes.

## Decisión de acceso

El flujo es:

1. El usuario abre una ruta del workspace (`/workspace`, `/workspace/crm`, etc.).
2. `src/app/(workspace)/layout.tsx` ejecuta `getWorkspaceContext()`, que obtiene `headers()` y llama a `payload.auth({ headers })` en el servidor.
3. Sin usuario válido, redirige a `/admin/login?redirect=/workspace` (el login sigue siendo el nativo de Payload; no hay un login propio del workspace).
4. Tras autenticarse, el usuario entra a `/workspace` y navega por el resto de módulos vía `WorkspaceHeader` (nav superior propia del workspace, no la de Payload).
5. `/admin` sigue disponible para tareas técnicas según el rol; `WorkspaceHeader` incluye un enlace «Admin» (solo visible para `admin`) que abre `/admin` en una pestaña nueva, sin integrarlo visualmente al workspace.

El parámetro de retorno del login debe restringirse a rutas internas permitidas para evitar open redirects. La sesión válida habilita la entrada, pero no autoriza por sí sola cada operación.

## Mapa integrado

```text
Martes Hub (Next.js + Payload)
├── /admin                          consola técnica Payload — nativa, sin custom views
└── /workspace                      aplicación operativa protegida (UI Storelink)
    ├── /workspace                  inicio: KPIs, embudo CRM, cobros recientes, mini CRM
    ├── /workspace/crm, /workspace/crm/[type]/[id]   leads, clientes y ficha 360
    ├── /workspace/tasks, /workspace/tasks/[id]      tablero/lista y ficha de tareas
    ├── /workspace/inbox            WhatsApp e Instagram (OpenBSP)
    ├── /workspace/hoy               seguimientos priorizados del día
    ├── /workspace/social            calendario, publicaciones y cuentas
    └── /workspace/billing           cobros, pendientes y accesos a facturación
```

Los detail pages (`/workspace/crm/[type]/[id]`, `/workspace/tasks/[id]`) son rutas dinámicas normales de Next.js (no custom views de Payload), y conservan la UX completa (timeline de actividades, checklist, conversión lead→cliente) en vez de degradar a la vista de edición de una colección.

Relaciones esperadas:

- Un lead puede convertirse en cliente y conservar su actividad.
- Una conversación se vincula con el lead o cliente y puede originar tareas.
- Tareas, pagos, membresías, cotizaciones y formularios alimentan `/workspace`.
- Algunas acciones de backoffice sin UI propia en el workspace (crear factura, cotización, ver pago individual) enlazan deliberadamente a `/admin/collections/...`; eso no es un acoplamiento visual, es reutilizar el CRUD nativo de Payload para lo que el workspace todavía no cubre.

## Shell común y navegación

`WorkspaceHeader` (`src/components/workspace/WorkspaceHeader.tsx`) es el shell compartido por todas las páginas de `/workspace`, y reemplaza cualquier navegación de Payload dentro de esa superficie:

- nav superior en pills (Resumen, CRM, Tareas, Hoy, Inbox, Social, Facturación) con estado activo por ruta;
- identidad del tenant y del usuario (iniciales, rol) en el chip derecho;
- enlace «Admin» solo para rol `admin`, que abre `/admin` en pestaña nueva.

Primitivas visuales reutilizables en `src/components/workspace/ui.tsx` (`PageHeader`, `KpiCard`, `Panel`, `EmptyState`, `Badge`) mantienen consistencia entre módulos sin duplicar clases de Tailwind. El CSS del workspace (`src/styles/workspace.css`) carga Tailwind v4 completo (theme + utilities + preflight) — a diferencia de `custom.css` del admin, que permanece vacío porque el admin no tiene estilos propios que cargar.

Todos los iconos, badges y colores deben acompañarse de texto o etiquetas accesibles.

## Fronteras de ejecución

### Lecturas

- Server Components para la carga inicial y autorización cercana a los datos.
- Payload Local API en servidor, con selección mínima de campos, paginación y filtros explícitos.
- Consultas agregadas dedicadas para overview/analytics; no descargar colecciones completas para agregarlas en React.
- SWR solo cuando una vista cliente necesite revalidación, polling o estado compartido sincronizado.

### Mutaciones

- Route Handlers o Server Actions con validación de entrada, sesión, rol y tenant.
- Nunca confiar en un `tenantId` enviado por el cliente sin comprobar pertenencia.
- Respuestas normalizadas para éxito, validación, conflicto, permiso y error recuperable.
- Acciones sensibles auditables e idempotencia donde haya webhooks, jobs, email o pagos.

### Componentes cliente

Se reservan para interacción: kanban, filtros, drawers, composer del inbox y feedback optimista. No deben contener secretos, construir autorización ni acceder directamente a Neon.

## Modelo de seguridad

Cada lectura y mutación del workspace debe pasar estas capas:

1. **Sesión:** usuario obtenido desde la cookie HTTP-only de Payload.
2. **RBAC:** capacidad explícita para `admin`, `agente` o `viewer`.
3. **Tenant:** tenant activo derivado de membresías autorizadas, no de un valor libre del navegador.
4. **Acceso Payload:** al usar Local API, pasar `user` y `overrideAccess: false` cuando se espere aplicar access control. Payload Local API usa `overrideAccess: true` por defecto.
5. **Filtro de datos:** consultas tenant-aware incluso en agregaciones, exportaciones, relaciones y jobs.
6. **Validación y auditoría:** validar payloads y registrar acciones sensibles sin secretos ni contenido privado innecesario.

Ocultar un enlace o proteger solo el layout no sustituye estos controles. Los webhooks que legítimamente usan `overrideAccess: true` deben autenticar la fuente, resolver el tenant de forma determinista y validarlo antes de escribir.

### Matriz inicial

| Capacidad | admin | agente | viewer |
|---|---:|---:|---:|
| Usar workspace | Sí | Sí | Sí |
| Leer datos del tenant | Sí | Sí | Sí |
| Crear/editar operación diaria | Sí | Sí | No |
| Eliminar datos sensibles | Sí | Limitado | No |
| Gestionar tenants/usuarios/configuración | Sí | No | No |
| Usar acciones de Hermes | Según allowlist | Según allowlist | Solo lectura |

La matriz definitiva debe traducirse a helpers reutilizables y pruebas, no quedar únicamente documentada.

## Hermes y MCP: estado real y objetivo

`@payloadcms/plugin-mcp` está registrado en `/admin` y expone colecciones configuradas — eso es backoffice técnico, independiente del workspace. Hoy no existe ningún sidecar ni vista de chat de Hermes conectada al workspace: el sidecar simulado (`HermesAiSidecar`) que existía en un diseño anterior se retiró sin reemplazo, y `/workspace` (la página de inicio) es un dashboard con datos reales del tenant, no un agente conversacional. Tampoco todo el MCP es de solo lectura; la configuración actual permite crear y actualizar en varias colecciones.

La integración futura requiere:

```text
Panel o vista de chat de Hermes dentro de /workspace (por construir)
  -> route AI autenticada
  -> agente/modelo server-side
  -> herramientas allowlisted por rol y tenant
  -> Payload/MCP con acceso explícito
  -> respuesta streaming + deep links + auditoría
```

Antes de habilitarla se debe definir por herramienta `find/create/update/delete`, limitar campos y resultados, impedir cruces de tenant, aplicar rate limits y registrar invocaciones, y decidir si el chat vive como página propia (`/workspace/hermes`) o como panel embebido en `/workspace`. La primera versión debe presentar Hermes deshabilitado o «demo», nunca como consulta real.

## Sistema visual funcional

La dirección visual debe partir del trabajo diario, no de efectos decorativos:

- tokens semánticos para fondo, superficie, texto, borde, acción y estados;
- máximo dos familias tipográficas y jerarquía consistente;
- densidad compacta para tablas/inbox y más aire en overview;
- una acción primaria clara por contexto;
- estados `loading`, `empty`, `error`, `permission denied`, `offline` y `stale` en cada módulo;
- foco visible, contraste AA, labels, live regions para actualizaciones y navegación completa por teclado;
- layouts mobile-first sin perder acciones esenciales;
- tablas y kanban con alternativas accesibles, filtros persistentes en URL y deep links compartibles.

Los datos, badges y gráficos solo aparecerán si ayudan a decidir o actuar. Los estilos inline del scaffold se migrarán gradualmente a tokens y componentes reutilizables.

## Capacidad: Payload + Vercel + Neon

La arquitectura es adecuada para el uso interno actual y para aproximadamente 1–20 tenants de tamaño similar. Tener muchos módulos registrados no provoca por sí mismo un crash: Payload ejecuta solo las rutas, consultas y jobs solicitados. Los riesgos reales son consultas sin límites, índices ausentes, conexiones excesivas, trabajos largos, archivos en almacenamiento efímero y aislamiento incompleto.

Controles antes de crecer:

- índices compuestos que empiecen por `tenant` y continúen por campos de filtro/orden frecuentes (`status`, `updatedAt`, fechas);
- paginación obligatoria, límites máximos y `select` mínimo;
- agregados específicos para dashboard, evitando N+1 y conteos repetidos por widget;
- `DATABASE_URL` pooled para runtime serverless y conexión directa/no pooled para migraciones;
- región de Vercel y Neon alineada para reducir latencia;
- media/documentos en S3 compatible, no en filesystem de Vercel;
- jobs cortos, idempotentes, por lotes y reanudables; externalizar procesos largos cuando aparezcan límites reales;
- ramas Neon para probar migraciones, PITR/restore ensayado, métricas de Vercel, logs estructurados y alertas.

### Señales para optimizar, no para rediseñar prematuramente

Investigar cuando el p95 de una pantalla operativa supere aproximadamente 1 s de servidor de forma sostenida, una consulta escanee grandes porciones de una tabla, los jobs excedan su ventana, aumenten los errores de conexión o la concurrencia real degrade el inbox. Entonces se revisan índices/planes, caché, batching, read replicas o workers; no se introduce infraestructura adicional solo por llegar a 20 tenants.

## Criterios arquitectónicos de aceptación

- `/admin` sigue funcionando como backoffice nativo.
- Toda ruta del workspace exige sesión server-side.
- Cada operación de negocio prueba rol y tenant.
- Ninguna página depende de datos demo para declararse terminada.
- Las consultas están paginadas y las agregaciones tienen contrato propio.
- Todos los módulos exponen estados de carga, vacío, error y permiso.
- Hermes se muestra como demo hasta contar con ruta autenticada y herramientas restringidas.
- Existen pruebas negativas de cruce de tenants y roles.

El plan ejecutable está en [`WORKSPACE_UI_SPRINT.md`](./WORKSPACE_UI_SPRINT.md).
