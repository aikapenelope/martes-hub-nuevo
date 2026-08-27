# Arquitectura del Martes Workspace

## Propósito y estado

Martes Hub tiene dos superficies dentro de la misma aplicación Next.js y el mismo despliegue de Vercel:

- `/admin`: backoffice técnico nativo de Payload. Sirve para administrar colecciones, usuarios, tenants, configuración y operaciones de bajo nivel. No se reemplaza ni se modifica destructivamente.
- `src/app/(workspace)`: producto operativo para el equipo. El route group `(workspace)` organiza el código y no aparece en la URL; sus rutas son `/overview`, `/crm`, `/tasks`, `/inbox`, `/social`, `/billing` y `/analytics`.

Ambas superficies comparten Payload, la sesión `payload-token`, Neon Postgres, colecciones, permisos e integraciones. Los módulos están separados para mantener el código entendible, no porque sean aplicaciones independientes.

El scaffold actual define navegación y dirección de producto, pero todavía no es la UI operativa: usa datos de demostración, estilos inline y controles incompletos. Hermes es un sidecar simulado y no está conectado a una ruta de IA.

## Decisión de acceso

El flujo recomendado es:

1. El usuario abre una ruta del workspace.
2. `src/app/(workspace)/layout.tsx` obtiene `headers()` y ejecuta `payload.auth({ headers })` en el servidor.
3. Sin usuario válido, redirige a `/admin/login?redirect=/overview`.
4. Tras autenticarse con Payload, el usuario entra a `/overview` y navega por el workspace.
5. `/admin` continúa disponible para tareas técnicas según el rol.

Como mejora futura se puede añadir en el admin un enlace no destructivo «Abrir workspace». No se debe sustituir el dashboard nativo de Payload ni depender de una redirección cliente para proteger el producto.

El parámetro de retorno del login debe restringirse a rutas internas permitidas para evitar open redirects. La sesión válida habilita la entrada, pero no autoriza por sí sola cada operación.

## Mapa integrado

```text
Martes Hub (Next.js + Payload)
├── /admin                    consola técnica Payload
└── /(workspace)              aplicación operativa protegida
    ├── /overview             prioridades y pulso diario
    ├── /crm                  leads, clientes y actividad
    ├── /tasks                ejecución y seguimiento
    ├── /inbox                WhatsApp, Instagram y email
    ├── /social               calendario, publicación y métricas
    ├── /billing              ofertas, cotizaciones, facturas y cobros
    └── /analytics            indicadores y reportes
```

Relaciones esperadas:

- Un lead puede convertirse en cliente y conservar su actividad.
- Una conversación se vincula con el lead o cliente y puede originar tareas.
- Tareas, pagos, membresías, cotizaciones y formularios alimentan `/overview`.
- Las métricas sociales y de campañas alimentan `/analytics`.
- Hermes, cuando exista la integración real, consultará únicamente datos autorizados y devolverá deep links a estas rutas.

## Shell común y navegación

`WorkspaceShell` será el marco compartido y no el dueño de los datos de negocio. Debe contener:

- sidebar responsive con estado activo, agrupación clara y navegación por teclado;
- header con título contextual, búsqueda global, identidad del usuario y tenant activo;
- área principal con ancho y densidad adecuados para tablas, kanban y conversaciones;
- estados globales de conectividad e integraciones sin números decorativos;
- drawer de Hermes desacoplado y claramente marcado como no disponible mientras sea demo.

En móvil, la navegación será un drawer y el contenido conservará acciones críticas visibles. En escritorio se priorizará densidad, escaneo rápido y atajos. Todos los iconos, badges y colores deben acompañarse de texto o etiquetas accesibles.

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

`@payloadcms/plugin-mcp` está registrado y expone colecciones configuradas. Eso no significa que `HermesAiSidecar` esté conectado: hoy responde mediante temporizador y texto simulado. Tampoco todo el MCP es de solo lectura; la configuración actual permite crear y actualizar en varias colecciones.

La integración futura requiere:

```text
HermesAiSidecar
  -> route AI autenticada
  -> agente/modelo server-side
  -> herramientas allowlisted por rol y tenant
  -> Payload/MCP con acceso explícito
  -> respuesta streaming + deep links + auditoría
```

Antes de habilitarla se debe definir por herramienta `find/create/update/delete`, limitar campos y resultados, impedir cruces de tenant, aplicar rate limits y registrar invocaciones. La primera versión del workspace debe presentar Hermes deshabilitado o «demo», nunca como consulta real.

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
