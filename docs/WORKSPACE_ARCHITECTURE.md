# Arquitectura del Martes Workspace

## Propósito y estado

Martes Hub expone una única superficie de administración: el admin nativo de Payload en `/admin`, extendido con **custom admin views** para el producto operativo del equipo. No existe una aplicación separada con su propio shell/root-layout; todo el producto vive dentro del árbol de Next.js que renderiza `/admin`.

- `/admin/collections/...`, `/admin/globals/...`: backoffice técnico nativo de Payload (colecciones, usuarios, tenants, configuración).
- `/admin/overview`, `/admin/crm`, `/admin/tasks`, `/admin/inbox`, `/admin/social`, `/admin/billing`, `/admin/analytics`, `/admin/hoy`, `/admin/dashboard`: vistas operativas del equipo, registradas como custom views en `admin.components.views` (`src/payload.config.ts`) y renderizadas dentro del mismo shell de navegación de Payload (sidebar + `afterNavLinks`).

Este reemplaza el diseño anterior de un route group `src/app/(workspace)` con su propio root layout, sidebar (`WorkspaceShell`/`WorkspaceHeader`/`WorkspaceSidebar`) y sidecar de IA (`HermesAiSidecar`). Ese código se eliminó: Payload ya provee navegación, header y sesión, y duplicar un shell propio solo agregaba una segunda superficie a mantener sin aportar funcionalidad adicional. El sidecar de Hermes (chat simulado) se retiró sin reemplazo — la integración real de Hermes sigue siendo trabajo futuro (ver sección «Hermes y MCP» más abajo).

Todas las vistas comparten Payload, la sesión `payload-token`, Neon Postgres, colecciones, permisos e integraciones. Los módulos están separados en archivos por dominio (`src/components/admin/*View.tsx`, `src/views/*.tsx`) para mantener el código entendible, no porque sean aplicaciones independientes.

## Decisión de acceso

El flujo real es:

1. El usuario navega a una vista del workspace bajo `/admin/...` (por ejemplo `/admin/overview`).
2. Payload renderiza el componente registrado en `admin.components.views` como Server Component; ese componente llama a `getWorkspaceContext()`, que obtiene `headers()` y ejecuta `payload.auth({ headers })` en el servidor.
3. Sin usuario válido, redirige a `/admin/login?redirect=/admin/overview`.
4. Tras autenticarse con Payload, el usuario entra a `/admin/overview` y navega por el resto de vistas vía el sidebar (`DashboardNavLink` + navegación nativa de Payload).
5. El resto de `/admin` (colecciones, config) sigue disponible para tareas técnicas según el rol, sin enlaces adicionales necesarios: es la misma superficie.

`getWorkspaceContext()` acepta `searchParams` opcional: Payload inyecta `params`/`searchParams` como objetos planos a las custom views (no como `Promise` del App Router), así que las vistas usan `(await searchParams) ?? {}` para funcionar con ambas formas.

El parámetro de retorno del login debe restringirse a rutas internas permitidas para evitar open redirects. La sesión válida habilita la entrada, pero no autoriza por sí sola cada operación.

## Mapa integrado

```text
Martes Hub (Next.js + Payload, una sola superficie: /admin)
├── /admin/collections/...     backoffice técnico Payload
├── /admin/overview            prioridades y pulso diario
├── /admin/crm, /admin/crm/:type/:id   leads, clientes y actividad
├── /admin/tasks, /admin/tasks/:id     ejecución y seguimiento
├── /admin/inbox               WhatsApp, Instagram y email
├── /admin/social               calendario, publicación y métricas
├── /admin/billing              ofertas, cotizaciones, facturas y cobros
├── /admin/analytics             indicadores y reportes
├── /admin/hoy                  seguimientos del día
└── /admin/dashboard             dashboard tipo Hermes (datos reales, sin IA todavía)
```

Cada vista dinámica (`/admin/crm/:type/:id`, `/admin/tasks/:id`) se registra en `payload.config.ts` usando rutas `path-to-regexp` (soportado nativamente por las custom views de Payload), conservando la UX de ficha completa (timeline, checklist, conversión lead→cliente) en vez de degradar a la vista de edición genérica de una colección.

Relaciones esperadas:

- Un lead puede convertirse en cliente y conservar su actividad.
- Una conversación se vincula con el lead o cliente y puede originar tareas.
- Tareas, pagos, membresías, cotizaciones y formularios alimentan `/admin/overview`.
- Las métricas sociales y de campañas alimentan `/admin/analytics`.
- Hermes, cuando exista la integración real, consultará únicamente datos autorizados y devolverá deep links a estas rutas.

## Shell común y navegación

No hay un shell propio: el sidebar, el header (identidad del usuario, tenant activo) y la navegación responsive los provee el admin panel nativo de Payload. `DashboardNavLink` (`admin.components.afterNavLinks`) agrega los enlaces a las vistas operativas (Resumen, CRM, Tareas, Inbox, Facturación, Social, Analíticas, Hoy) al sidebar existente en vez de construir uno nuevo.

Consecuencias de este enfoque:

- Accesibilidad de navegación por teclado, foco y responsive los hereda del admin de Payload; no se reimplementan.
- El área principal de cada vista usa las clases `.workspace-*` (definidas en `src/styles/workspace.css`, cargadas junto con `theme.css`/`utilities.css` de Tailwind v4 en `src/app/(payload)/custom.css`) para mantener densidad y tablas consistentes entre vistas.
- No existe todavía un drawer de Hermes: se retiró el sidecar simulado. Cuando la integración real de Hermes exista (ver «Hermes y MCP»), deberá decidirse si vive como panel embebido en una vista o como una nueva custom view, sin depender de un shell propio.

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

`@payloadcms/plugin-mcp` está registrado y expone colecciones configuradas. Eso no significa que exista una integración de IA conectada al workspace: el sidecar de chat simulado (`HermesAiSidecar`) que existía en el shell propio se retiró al migrar a custom admin views, y todavía no hay ruta de IA real. La vista `/admin/dashboard` ("Dashboard (Hermes)") usa datos reales del tenant, pero es un dashboard, no un agente conversacional. Tampoco todo el MCP es de solo lectura; la configuración actual permite crear y actualizar en varias colecciones.

La integración futura requiere:

```text
Panel o vista de chat de Hermes (por definir dónde vive)
  -> route AI autenticada
  -> agente/modelo server-side
  -> herramientas allowlisted por rol y tenant
  -> Payload/MCP con acceso explícito
  -> respuesta streaming + deep links + auditoría
```

Antes de habilitarla se debe definir por herramienta `find/create/update/delete`, limitar campos y resultados, impedir cruces de tenant, aplicar rate limits y registrar invocaciones, y decidir si el chat vive como una nueva custom view o como panel embebido en una vista existente. La primera versión debe presentar Hermes deshabilitado o «demo», nunca como consulta real.

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
