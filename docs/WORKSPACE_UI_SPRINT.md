# Sprint ejecutable: Martes Workspace UI

## Resultado esperado

Convertir el scaffold actual en la aplicación operativa que utilizará el equipo, conservando `/admin` como backoffice técnico. El trabajo se entrega por incrementos verticales: cada módulo debe estar conectado a datos reales, autorizado por rol y tenant, ser usable en móvil/escritorio y tener pruebas antes de considerarse terminado.

## Reglas del sprint

- Ningún dato demo entra en una entrega marcada como operativa.
- UI oculta no equivale a autorización: el servidor decide cada capacidad.
- Los componentes cliente no acceden a Neon ni manejan secretos.
- Cada consulta tiene límite, paginación, `select` y tenant.
- Cada mutación valida entrada, sesión, rol, tenant y resultado.
- Cada pantalla incluye loading, empty, error y permiso denegado.
- `/admin` no se rediseña; solo puede recibir un enlace no destructivo al workspace.

## Orden de ejecución

### 1. Fundación segura del workspace

**Entregables**

- Helper server-side `getWorkspaceContext()` con usuario, roles, tenants autorizados y tenant activo.
- Política para resolver/cambiar tenant y persistir la selección sin aceptar IDs no autorizados.
- Helpers de capacidades reutilizables y matriz RBAC comprobable.
- Redirect interno seguro desde login hacia `/overview`.
- Patrón único de Local API con `user`, `overrideAccess: false`, paginación y filtro de tenant.
- Enlace «Abrir workspace» desde Payload admin, sin reemplazar vistas nativas.

**Criterios de aceptación**

- Usuario anónimo no puede renderizar ni consultar rutas del workspace.
- `viewer` no puede mutar; `agente` no administra tenants; `admin` conserva backoffice.
- Manipular el tenant desde URL, cookie o body no permite leer/escribir otro tenant.
- Pruebas de integración cubren sesión expirada, rol insuficiente y cruce de tenant.

### 2. Design system operativo

**Entregables**

- Tokens semánticos de color, tipografía, spacing, radius, elevación, estados y densidad.
- Primitivas accesibles: Button, IconButton, Input, Select, Badge, Tabs, Table, Dialog, Drawer, Tooltip, Skeleton y EmptyState.
- Patrones de producto: PageHeader, FilterBar, DataTable, StatSummary, ActivityFeed, Kanban y FeedbackState.
- Eliminación progresiva de estilos inline del workspace.

**Criterios de aceptación**

- Máximo cinco colores base y dos familias tipográficas.
- Contraste AA, foco visible y controles con nombre accesible.
- Ningún texto de cuerpo menor a 14 px.
- Página interna permite revisar todos los estados y variantes.

### 3. Shell responsive y navegación

**Entregables**

- Sidebar colapsable en escritorio y drawer en móvil.
- Header contextual con tenant, usuario, búsqueda y estado de integraciones.
- Navegación activa basada en ruta, breadcrumbs donde aporten contexto y deep links.
- Command palette con acciones reales y filtradas por permisos.
- Hermes desacoplado; visible como «demo/no disponible» hasta su fase.

**Criterios de aceptación**

- Navegación completa con teclado, foco restaurado tras drawers y Escape funcional.
- No hay overflow u ocultación de acciones críticas entre 320 px y escritorio amplio.
- Badges y estados no dependen únicamente del color.
- Los enlaces no autorizados no aparecen y las rutas siguen protegidas en servidor.

### 4. Overview con datos reales

**Entregables**

- Contrato agregado server-side para seguimientos, conversaciones pendientes, tareas, cobros y alertas.
- Lista «Qué hacer hoy» ordenada por urgencia con acciones y deep links.
- Indicadores compactos con definición y periodo explícitos.
- Revalidación prudente; evitar una consulta independiente no coordinada por cada tarjeta.

**Criterios de aceptación**

- Todos los números proceden del tenant activo y enlazan al subconjunto que representan.
- La pantalla no descarga colecciones completas ni genera N+1.
- Estados parciales permiten que un proveedor caído no inutilice todo el overview.
- p95 y número de queries quedan registrados como baseline.

### 5. Módulos verticales

Implementar en este orden por dependencia: CRM, Tasks, Inbox, Billing, Social y Analytics.

#### CRM

- Pipeline y tabla accesible para leads; ficha 360 de lead/cliente; timeline de actividades.
- Filtros en URL, paginación, edición según rol y conversión lead→cliente.
- Done: crear/editar/convertir y abrir conversación/tarea relacionada sin perder contexto.

#### Tasks

- Kanban y vista lista equivalentes; prioridad, fecha, asignación, checklist y relaciones.
- Actualización optimista con rollback y conflictos visibles.
- Done: una tarea creada desde CRM/Inbox aparece en todas las vistas del mismo tenant.

#### Inbox

- Lista virtualizable/paginada de conversaciones, hilo, composer, templates y estados de entrega.
- Manejo explícito de ventana del canal, opt-out, error OpenBSP y reintento seguro.
- Done: entrada, respuesta y estado quedan registrados y vinculados al contacto correcto.

#### Billing

- Ofertas, cotizaciones, facturas y pagos con estados y permisos claros.
- Importes calculados/validados en servidor; PDFs y envío con feedback auditable.
- Done: el usuario puede seguir el ciclo cotización→factura→pago sin entrar al admin.

#### Social

- Calendario/lista, composer, preview y estado de conexión Meta.
- Funciones bloqueadas explican qué integración falta; no simulan publicación exitosa.
- Done: publicar/programar y consultar resultado real cuando Meta esté habilitado.

#### Analytics

- Métricas definidas, filtros de fecha, comparación y exportación autorizada.
- Agregaciones server-side e índices revisados; gráficos con tabla accesible equivalente.
- Done: cada métrica documenta fuente, periodo y definición, y respeta el tenant.

### 6. Hermes por fases

**Fase A: honestidad del producto**

- Eliminar respuestas simuladas de la experiencia operativa o etiquetar el sidecar inequívocamente como demo.
- Mostrar capacidades futuras sin controles que parezcan ejecutar acciones reales.

**Fase B: integración segura**

- Route AI server-side autenticada con streaming.
- Herramientas allowlisted por rol/tenant y por operación.
- Primera versión read-only; límites de campos, filas, tiempo y frecuencia.
- Auditoría de prompts/herramientas con redacción de secretos y política de retención.
- Deep links verificables a registros del workspace.

**Criterios de aceptación**

- Ninguna herramienta puede cruzar tenant ni escalar privilegios.
- Un fallo del modelo/MCP no bloquea el resto del workspace.
- Las respuestas distinguen hechos consultados, ausencia de datos y errores.
- Pruebas adversariales cubren prompt injection y solicitudes de mutación no permitidas.

### 7. Calidad y salida

**Cobertura obligatoria**

- Integración: RBAC, aislamiento tenant, filtros y mutaciones críticas.
- E2E: login→overview→CRM→tarea→inbox; viewer en modo lectura; cambio autorizado de tenant.
- Accesibilidad: teclado, foco, nombres, contraste y anuncios dinámicos.
- Responsive: móvil, tablet y escritorio para shell y flujos críticos.
- Rendimiento: queries por pantalla, p95 server-side, payload inicial y listas grandes.
- Operación: errores OpenBSP/Resend/Meta, jobs idempotentes y recuperación.

## Definición global de terminado

Una historia está terminada cuando:

1. usa datos reales y tenant activo;
2. aplica autorización server-side y validación;
3. incluye loading, empty, error, permiso y éxito;
4. funciona con teclado y en móvil/escritorio;
5. tiene pruebas positivas y negativas relevantes;
6. no introduce consultas sin límite, N+1 ni secretos en cliente;
7. documenta cualquier dependencia externa pendiente;
8. pasa `pnpm typecheck`, pruebas aplicables, `pnpm lint` y build de preview.

## Capacidad y guardrails para 1–20 tenants

Payload + Vercel + Neon no requiere otra arquitectura para este rango. Antes de escalar se debe:

- medir, no asumir, latencia y concurrencia;
- crear índices tenant+estado/fecha según queries reales;
- usar conexión pooled en runtime y directa en migraciones;
- procesar jobs por lotes pequeños e idempotentes;
- almacenar uploads en S3 compatible;
- probar restore/PITR y migraciones en ramas Neon;
- alertar sobre errores de conexión, p95 alto, backlog de jobs y fallos de webhooks.

Solo se evalúan workers dedicados, read replicas o caché adicional cuando las métricas demuestren el cuello de botella.
