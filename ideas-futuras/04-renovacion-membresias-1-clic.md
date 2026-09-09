# 04 · Renovación de membresías en 1 clic

> Idea nueva (2026-09-09): cerrar el círculo del dinero — aprietas "Renovar"
> en la membresía → nace el cobro pendiente → el sistema existente lo marca
> vencido y avisa → lo marcas pagado. Tamaño S: el patrón "1 clic → cobro" ya
> está probado en el repo (`convertQuoteToInvoiceAction`).

## Problema (estado real verificado en el repo)

- `renewalDate` se mueve 100% a mano: `src/lib/membership-actions.ts` solo
  tiene `createMembershipAction` (la fija al crear) y
  `changeMembershipStatusAction` (cambia el estado). Nada la adelanta sola.
- **No hay relación entre membresías y pagos**: `Payments.ts` no tiene campo
  `membership` — un cobro no sabe que viene de una membresía.
- Ningún job crea cobros desde membresías: `paymentReminders.ts` solo toca
  `payments`, y `dailyDigest.ts` solo **cuenta** renovaciones a 7 días
  (línea ~168) para el resumen.

Lo bueno: el ciclo de pagos reales de Venezuela ya funciona — cobro pendiente
→ el job de recordadores lo marca vencido y avisa → se marca pagado. Solo
falta que la renovación de una membresía **genere** ese cobro.

## Decisión cerrada

Renovación **manual de 1 clic** (no auto-renovación por job — el control
humano es el requisito; la auto-renovación con flag por membresía es fase 2).

## Flujo

```
/workspace/memberships — fila de la membresía
  [ Renovar ]  ← las vencidas y por vencer ya se resaltan (ámbar) y
                 quedan arriba (sort por renewalDate)
  ▼
Server action renewMembershipAction(membershipId)
  1. getWorkspaceContext + assertEditor (patrón billing-actions)
  2. Fast path: si ya existe payments con renewalKey del período →
     devolver ese cobro (doble clic secuencial; cero writes)
  3. Reclamo atómico: update memberships WHERE renewalDate = valorViejo.
     0 docs = otro proceso ya renovó → buscar por renewalKey (consulta
     fresca) y devolver el payment del ganador — el perdedor NUNCA
     llega al INSERT, así que no hay transacción abortada que consultar
  4. Ganador: crea payments { pendiente, amount = monthlyPrice,
     dueDate = renewalDate actual, concept = "Renovación {plan}",
     client, membership, renewalKey } + adelanta renewalDate +1 mes
     y devuelve status = 'activa' — todo en la misma transacción
     (req pasado a ambas operaciones)
  ▼
El sistema existente hace el resto, sin código nuevo:
  payment-reminders marca vencido y avisa ·
  el usuario marca pagado (método + paidAt) ·
  el digest ya cuenta la renovación
```

Encaja con la idea 02 (conciliación por WhatsApp): el comprobante que mande el
cliente conciliará contra este cobro pendiente.

## Modelo de datos

### `payments` — dos campos nuevos

| Campo | Tipo | Nota |
|---|---|---|
| `membership` | relationship → memberships (opcional) | trazabilidad: hoy un cobro no sabe que viene de una membresía |
| `renewalKey` | text, **índice único** | clave de idempotencia protegida por la BD: `{tenantId}:{membershipId}:{periodo}` donde `periodo` es el mes de la `renewalDate` que se renueva (ej. `4:2026-09`). Dos creates concurrentes: la BD rechaza el segundo con 23505 |

### `memberships` — nada nuevo en v1

Los campos necesarios ya existen: `monthlyPrice`, `renewalDate`,
`status` (`activa/pausada/vencida/cancelada`). Fase 2 añadiría
`autoRenew` (checkbox) y opcionalmente `billingCycle` si algún día hay
planes anuales — hoy todo es mensual (`monthlyPrice`).

## Consideraciones al construir (Payload + estado del repo)

- **Idempotencia/concurrencia (el riesgo real)**: un doble clic o dos peticiones
  concurrentes no deben crear dos cobros, y el perdedor debe recibir el cobro
  del ganador (no un error). Un `update` sobre `memberships` no puede consultar
  atómicamente la ausencia de un payment (otra colección), y **capturar el
  23505 para seguir consultando por el mismo `req` no es opción**: un unique
  violation aborta la transacción de Postgres y ninguna query posterior corre
  por ese `req`. Por eso el orden de operaciones hace que el perdedor jamás
  llegue al INSERT:
  1. **Fast path por `renewalKey`**: buscar el payment del período
     (`{tenantId}:{membershipId}:{periodo}`) antes de escribir; si existe,
     devolverlo. Cubre el doble clic secuencial sin tocar la BD en escritura.
  2. **Reclamo condicional de la membresía** (patrón
     `convertQuoteToInvoiceAction`, `billing-actions.ts:398`):
     `payload.update` con `where` `renewalDate = valorViejo`. El UPDATE de
     Postgres es atómico por fila: el perdedor bloquea sobre la fila, reevalúa
     la condición tras el commit del ganador y matchea 0 docs. Como ambos
     writes del ganador van en una transacción, cuando el perdedor sale del
     bloqueo el payment del ganador **ya está commiteado**: una consulta fresca
     (fuera de la transacción del perdedor, que nunca hizo writes) por
     `renewalKey` lo encuentra y se devuelve como resultado exitoso.
  3. **`renewalKey` con índice único = respaldo fail-closed**: si algún camino
     imprevisto llegara a intentar el INSERT duplicado, la BD aborta y la
     acción responde con error controlado — jamás dos cobros. No se "atrapa"
     el 23505 para continuar: la garantía real es el orden 1→2, el índice
     único es la última línea de defensa.
- **Atomicidad**: `create` del payment + `update` de la membresía en la misma
  transacción — pasar `req` a ambas operaciones anidadas (pitfall clásico de
  Payload: operación anidada sin `req` corre en transacción aparte).
- **Local API y access control**: server action de usuario →
  `overrideAccess: false` + `user` en todas las operaciones (la Local API
  bypassa el access control sin eso). Validar que la membresía pertenece al
  tenant activo (patrón `quoteTenantId !== context.tenantId` de
  billing-actions). El access de `payments`/`memberships` ya es
  `editorsOnly` en create/update — con `overrideAccess: false` se respeta solo.
- **Cálculo de la nueva fecha**: `renewalDate + 1 mes` con cuidado de fin de
  mes (31 ene → 28/29 feb). Decidir y testear una regla (sugerido: mismo día
  del mes siguiente, clamp al último día).
- **El cobro hereda el vencimiento viejo**: `dueDate = renewalDate ANTES de
  adelantarla` — así el job de recordadores trata la renovación como lo que
  es (un cobro que el cliente debía pagar en su fecha) y no como un cobro
  nuevo a 30 días.
- **Timeline del cliente (opcional pero barato)**: crear una `activity`
  ("Renovación generada") con `req` en la misma transacción; si los hooks de
  activities pudieran re-dispararse, cortar con `req.context` flag (patrón
  `skipLeadConversion` de `Clients.ts`).
- **Sin `versions.drafts`**: las colecciones del workspace van por `select`
  de estado (decisión deliberada del repo, ver comentario en `SocialPosts.ts`).
- **UI**: la página `/workspace/memberships` ya ordena por `renewalDate`, ya
  resalta en ámbar las que renuevan en 7 días y tiene el KPI "Renuevan en 7
  días" — el botón va en la fila de la tabla (server action + `revalidatePath`,
  mismo estilo que las acciones de billing). `MembershipStatusSelect` y
  `MembershipCreateDialog` marcan el estilo de los controles existentes.

## Checklist de implementación

- [ ] Migración: campos `membership` + `renewalKey` (unique) en `payments`
- [ ] `renewMembershipAction` en `src/lib/membership-actions.ts`:
      reclamo condicional (`renewalDate = valorViejo`) + payment pendiente con
      `renewalKey` + adelantar `renewalDate` (+ regla de fin de mes testeada),
      atómico con `req`
- [ ] Botón "Renovar" en la fila de `/workspace/memberships` (+ estado
      "renovada" con feedback y `revalidatePath`)
- [ ] Manejo del perdedor: fast path por `renewalKey` + reclamo 0 docs →
      consulta fresca del payment del ganador (sin tocar la transacción
      abortada); el índice único queda como respaldo fail-closed
- [ ] Test de integración: renovar → cobro creado, fecha adelantada, doble
      clic/concurrencia → el perdedor recibe el payment del ganador (un solo
      cobro, sin error), tenant incorrecto → rechazado
- [ ] Fase 2 (no ahora): flag `autoRenew` + job diario de auto-renovación
      (TaskConfig con schedule, misma doble capa de idempotencia)
