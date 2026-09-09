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
  2. Reclamo atómico de la membresía (update condicional — ver
     Consideraciones) para que un doble clic no cree dos cobros
  3. Crea payments { pendiente, amount = monthlyPrice,
     dueDate = renewalDate actual, concept = "Renovación {plan}",
     client, membership }
  4. Adelanta renewalDate +1 mes y devuelve status = 'activa'
     — todo en la misma transacción (req pasado a ambas operaciones)
  ▼
El sistema existente hace el resto, sin código nuevo:
  payment-reminders marca vencido y avisa ·
  el usuario marca pagado (método + paidAt) ·
  el digest ya cuenta la renovación
```

Encaja con la idea 02 (conciliación por WhatsApp): el comprobante que mande el
cliente conciliará contra este cobro pendiente.

## Modelo de datos

### `payments` — un campo nuevo

| Campo | Tipo | Nota |
|---|---|---|
| `membership` | relationship → memberships (opcional) | trazabilidad: hoy un cobro no sabe que viene de una membresía |

### `memberships` — nada nuevo en v1

Los campos necesarios ya existen: `monthlyPrice`, `renewalDate`,
`status` (`activa/pausada/vencida/cancelada`). Fase 2 añadiría
`autoRenew` (checkbox) y opcionalmente `billingCycle` si algún día hay
planes anuales — hoy todo es mensual (`monthlyPrice`).

## Consideraciones al construir (Payload + estado del repo)

- **Idempotencia/concurrencia (el riesgo real)**: un doble clic no debe crear
  dos cobros. Usar el patrón de reclamo condicional de
  `convertQuoteToInvoiceAction` (`billing-actions.ts:398`): un
  `payload.update` con `where` que solo acepte la membresía en estado
  renovable **y sin cobro de renovación pendiente**; si el reclamo falla,
  buscar y devolver el cobro ya creado (idempotencia amable, no error).
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

- [ ] Migración: campo `membership` en `payments` (relationship opcional)
- [ ] `renewMembershipAction` en `src/lib/membership-actions.ts`:
      reclamo condicional + payment pendiente + adelantar `renewalDate`
      (+ regla de fin de mes testeada), atómico con `req`
- [ ] Botón "Renovar" en la fila de `/workspace/memberships` (+ estado
      "renovada" con feedback y `revalidatePath`)
- [ ] Filtro/buscar cobro de renovación ya existente para idempotencia amable
- [ ] Test de integración: renovar → cobro creado, fecha adelantada, doble
      clic → un solo cobro, tenant incorrecto → rechazado
- [ ] Fase 2 (no ahora): flag `autoRenew` + job diario de auto-renovación
      (TaskConfig con schedule, mismo reclamo atómico)
