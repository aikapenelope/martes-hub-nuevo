# 02 · Conciliación de pagos desde WhatsApp

> Idea: el cliente manda la captura de su pago por WhatsApp → el sistema la
> lee, extrae los datos, deja el cobro precargado en Billing y el humano solo
> aprieta UN botón para conciliar. El cliente recibe confirmación automática.

## Principio rector

La imagen **no se duplica**: ya vive en `messages.content` (el webhook de
OpenBSP la guardó). El pago referencia al mensaje; el comprobante es un link,
no una copia. Cero storage nuevo — requisito SaaS.

## Identidad (requisito cerrado)

Todo lo que entre por WhatsApp y sea conciliación queda registrado bajo la
**misma identidad**: el webhook ya hace matching teléfono → cliente/lead al
hacer upsert de la conversación, así que el borrador de pago **hereda** la
relación `client`/`lead`/`tenant` de la conversación. No se calcula identidad
nueva en ningún punto del flujo.

## Flujo completo

```
WhatsApp/IG (OpenBSP)
  │ imagen entrante
  ▼
Webhook /webhooks/openbsp ──(mensaje type=image)──▶ encola job extract-payment-proof
  ▼ (no bloquea el webhook; mismo patrón del worker de IA que encola resúmenes)
Job extract-payment-proof
  1. Lee el mensaje + conversación → client/lead/tenant heredados
  2. Modelo de visión (Groq, salida JSON estructurada):
     { es_comprobante, monto, moneda, fecha, referencia, banco, tipo:
       pago_movil | zelle | transferencia | efectivo | otro }
  3. Si es_comprobante:
     a. Busca cobros abiertos del cliente (vencidos/por vencer) con
        monto ±5% → match sugerido (o null)
     b. Crea payments { estado: 'por_confirmar', sourceMessage, extracción*,
        match sugerido }  — idempotente por unique(sourceMessage)
  ▼
Billing → franja "Por conciliar"
  Tarjeta: datos extraídos + cliente + match sugerido
           + link "ver comprobante" (abre el mensaje en el drawer de la
             conversación — el renderer de imágenes ya existe)
  [ Conciliar ]  ← el único botón
  ▼
Server action conciliarPagoAction
  1. Valida tenant + rol (editorsOnly, patrón inbox-actions)
  2. payment.estado = 'pagado' (+ método, fecha real)
  3. Crea activity en el timeline del cliente (con req: atomicidad)
  4. marca context.skipConciliationHooks para no re-disparar hooks
  5. Si conversación dentro de ventana 24h → reply determinista vía
     message-dispatch: "Recibimos tu comprobante de $X, ref Y — te
     confirmamos en breve" (sendText, sin IA, sin agente)
```

## Modelo de datos

### `payments` — cambios

| Campo | Tipo | Nota |
|---|---|---|
| `estado` | select | nuevo valor **`por_confirmar`** junto a los existentes |
| `sourceMessage` | relationship → messages | el comprobante; unique para idempotencia |
| `extraidoMonto` / `extraidoMoneda` / `extraidoFecha` / `extraidoReferencia` / `extraidoBanco` / `extraidoTipo` | text/date/select | lectura de la extracción (historia auditable, no sobrescribe el monto real) |
| `matchSugerido` | relationship → payments (self) | cobro preexistente que coincide ±5% |
| `conciliadoPor` | relationship → users | quién apretó el botón |
| `conciliadoAt` | date | |

Índice único en `sourceMessage` → re-ejecuciones del job nunca duplican
(mismo criterio de idempotencia que `gcal_event_id` / `provider_id`).

### Prácticas Payload obligatorias (skill + convenciones del repo)

- Sin `versions.drafts`: el repo deliberadamente no usa `_status` en UI custom
  (ver comentario en `SocialPosts.ts`) — el estado va por `select`, como el
  resto de colecciones de negocio.
- Job de sistema con `overrideAccess: true` (confiable); server action de
  usuario con `overrideAccess: false` + validación de tenant (patrón
  `inbox-actions`).
- Operaciones anidadas SIEMPRE con `req` (atomicidad de transacción).
- `req.context` flag para cortar loops de hooks (patrón `skipLeadConversion`
  que ya usa `Clients.ts`).

## UI

- **Franja "Por conciliar"** arriba de Billing (`/workspace/billing`): tarjetas
  compactas con los datos ya listos — el usuario no teclea nada.
- Cada tarjeta: monto grande, ref/banco/tipo, cliente (chip con link a ficha),
  match sugerido ("coincide con cobro #INV-0042 de $50 vencido hace 3 días"),
  link comprobante, botón Conciliar (o Descartar → estado `descartado`).
- Badge en el Overview: "N pagos por conciliar" (entra al cockpit alert strip).

## Alternativas revisadas (y por qué no)

| Alternativa | Por qué no |
|---|---|
| Dejar la extracción al agente de OpenBSP | Los datos quedarían como texto de chat, no estructurados en BD; además exigiría abrir escritura de `payments` por MCP (hoy deliberadamente solo-lectura). El agente queda complementario: conversa; el sistema estructura. |
| OCR clásico (Tesseract) | Falla con las capturas de apps bancarias venezolanas (fuentes, contraste, layouts variados). El VLM es categoricamente mejor aquí y cuesta centavos. |
| Pasarela real (Stripe/MercadoPago) | Elimina el problema de raíz pero no es viable en VE hoy. El diseño deja el hueco listo: cuando exista, `estado: pagado + método` ya lo absorbe. |

## Checklist de implementación

- [ ] Migración: campos nuevos en `payments` + unique(sourceMessage)
- [ ] Job `extract-payment-proof` (cola desde el webhook cuando type=image)
- [ ] Extracción VLM con salida JSON estructurada vía `ai-provider.ts` (Groq)
- [ ] Matching de cobros abiertos ±5%
- [ ] Franja "Por conciliar" en Billing + card component
- [ ] Server action `conciliarPagoAction` (+ activity + reply determinista)
- [ ] Badge en Overview
- [ ] Tests: fixture de comprobante (pago móvil VE) → job → conciliación
