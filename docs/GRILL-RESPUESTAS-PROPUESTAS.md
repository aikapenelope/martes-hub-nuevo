# Grill de definición — RESPUESTAS PROPUESTAS

> Propuestas generadas a partir del código real (auditoría completa del repo).
> Leyenda: **[A]** = asunción de negocio que debes confirmar. El resto es derivado
> del estado actual del código. Corrige inline lo que no aplique.

## 1. WhatsApp / Mensajería

- **W1 (números por tenant):** A hoy → C después. Número compartido ahora (el override por tenant ya existe en `Tenants.ts`); migrar a WABA propia cuando un cliente externo lo exija.
- **W2 (ventana 24h):** B. Botón "enviar plantilla" con parámetros precargados. El 409 ya trae `needsTemplate`; solo falta el frontend que conecta `sendTemplate()` (hoy muerto).
- **W3 (broadcast WhatsApp):** A en fase 2, con guardarraíles: solo plantillas APPROVED, respeta opt-out, lotes con pacing, log por destinatario (reutiliza el patrón de `sendCampaignTask`). Primero campañas email sólidas.
- **W4 (Instagram DM):** Ocultar el canal en UI hoy (queda en enums sin dañar); activarlo cuando haya cuenta IG real conectada.
- **W5 (ticks de entrega):** Sí. `statusJson` ya se guarda en cada mensaje; mapear a ✓/✓✓/leído en el chat. Esfuerzo S.
- **W6 (asignación):** Sí. `assignee` existe con validación; falta UI: asignar/reasignar + filtro "mías"/"sin asignar".
- **W7 (auto-respuestas):** Postergar a fase 2. Primero W2/W5/W6.
- **W8 (cierre):** Sí simple: botón resolver + auto-cierre a 7 días sin actividad (el sweep ya recorre conversaciones).
- **W9 (opt-out STOP):** Sí, acoplado a W3: sin broadcast no hay presión; con broadcast, STOP → supresión.
- **W10 (volumen): [A]** <100 conversaciones/día. La arquitectura aguanta de sobra; a 10x, paginar la lista server-side.

## 2. Email: buzón y envío

- **E1 (buzón por tenant):** C. Hoy B (1 buzón→1 tenant, hardcode). "Conectar Gmail" por tenant (A) cuando el 2º tenant lo necesite; reutiliza `google/token.ts`.
- **E2 (responder desde CRM):** Fase 1 B (plantillas rápidas/mailto con contexto), fase 2 A (responder en hilo vía Resend con headers `In-Reply-To` usando `threadId` que ya se guarda).
- **E3 (identidad de envío):** B ahora (dominio de la agencia verificado en Resend; nunca `onboarding@resend.dev` en prod) → A por tenant (Resend Domains) con clientes.
- **E4 (solo Gmail):** Sí, solo Gmail. El cliente está aislado en `integrations/gmail` para añadir Outlook después.
- **E5 (Gmail vs Resend):** Híbrido diferido: respuestas 1-a-1 por Gmail (`gmail.send`) cuando exista buzón por tenant (E1=A); campañas siempre Resend.
- **E6 (vista de hilo):** Sí. `threadId` ya se almacena; agrupar la bandeja. S-M.
- **E7 (adjuntos email):** No por ahora (metadata-only es deliberado; cuerpo+adjuntos multiplica cuota de API y storage).
- **E8 (supresión de bounces):** Sí. Hard bounce → flag en contacto + exclusión en `sendCampaignTask`. Barato y protege reputación.
- **E9 (firma por tenant):** No ahora; viene gratis con E3=A.
- **E10 (retención):** No borrar nada aún (volumen bajo, sync de coste constante); revisar con X4.

## 3. Campañas de email

- **C1 (editor):** B. Plantillas fijas de marca con campos editables (un agente no escribe HTML). Editor de bloques fase 3.
- **C2 (preview + prueba):** Sí, lo primero. Preview con `renderEmailHtml` (ya existe) + "enviar prueba a mí". S.
- **C3 (unsubscribe):** Sí, obligatorio antes de escalar: link `/unsubscribe?c=<token>` en la plantilla base → landing que marca `optOutAt` + supresión + exclusión en el job.
- **C4 (segmentos):** C. Rubro ahora; reglas dinámicas cuando el rubro se quede corto (con X4).
- **C5 (programación):** Sí: `EMAIL_CAMPAIGNS_AUTO_SEND=true` + ventana 9:00–19:00 en timezone del tenant (requiere propagar timezone — fix ya detectado).
- **C6 (variables):** `{{nombre}}`, `{{empresa}}`, `{{ciudad}}`, `{{enlace}}` — todas escapadas con `escapeHtml` (corrige el hallazgo H1 de inyección).
- **C7 (métricas):** Dashboard de entrega primero (delivered/bounced/complained ya llegan por Svix). Opens/clicks solo si el plan de Resend los incluye.
- **C8 (drip):** No aún.
- **C9 (A/B):** No.
- **C10 (cancelación):** Sí — botón cancelar (chequeo entre lotes) + watchdog de campañas `sending` >30 min (es fix de auditoría H8 de todas formas).
- **C11 (volumen): [A]** <1.000 destinatarios/campaña. Al acercarse: paginar audiencia (hoy `limit: 500`) y ajustar pacing de lotes de 15.
- **C12 (adjuntos):** No — links a documentos (S3) en vez de adjuntos (entregabilidad).

## 4. CRM

- **F1 (etapas):** Fijas ahora; configurables por tenant cuando el 2º tenant quiera otro pipeline (requiere mover la config del kanban a una collection).
- **F2 (motivos de descarte):** Sí — `discardReason` (precio/timing/competencia/sin respuesta/otro) + reactivar. S.
- **F3 (duplicados):** Sí mínimo: aviso por email/teléfono al crear; merge manual fase 2.
- **F4 (asignación automática):** Sí — round-robin entre agentes activos al crear lead (Tally, manual, MCP). S.
- **F5 (scoring):** No aún.
- **F6 (SLA primer contacto):** Sí — lead sin actividad 24h → campana + fila en Followups de hoy.
- **F7 (campos custom):** No.
- **F8 (vistas guardadas):** No aún (filtros ya persisten en URL).
- **F9 (Apify):** No aún (source reservado).

## 5. Facturación

- **B1 (cobro real):** Registro manual ahora; links de pago fase 2. **[A]** Si el cobro es local (VE: Zelle/Pago Móvil), manual de todas formas; el valor está en el recordatorio claro.
- **B2 (fiscal): [A — confirma con contador]** Control interno; el PDF del plugin sirve de comprobante comercial. Fiscal legal (serie/folio/anulación) sería proyecto aparte.
- **B3 (moneda/impuesto):** Impuesto configurable por tenant sí (hoy 0.16 hardcode en el plugin). Moneda única USD sí.
- **B4 (renovación automática):** Sí — job diario ya corre; al llegar `renewalDate` crear payment pendiente, idempotente por (membership, período).
- **B5 (portal cliente):** No.
- **B6 (quotes vencidas):** Sí — `expiresAt` (30 días) + aviso en digest. S.

## 6. Tareas y agenda

- **A1 (citas bidireccionales):** Sí — crear cita en CRM → evento en gcal (añadir scope `calendar.events`). El espejo entrante ya existe; falta la mitad saliente.
- **A2 (tareas desde inbox/CRM):** Sí — "crear tarea" con prefill y link al origen. S.
- **A3 (recurrentes):** No aún.
- **A4 (tareas en digest):** Sí — vencidas/vencen hoy por responsable. Directo sobre el digest existente.
- **A5 (disponibilidad):** No.

## 7. Social

- **S1 (publicación real):** Humano-en-el-loop: MCP planifica, Metricool publica. Añadir botón "reintentar" en `failed` + watchdog de posts stale.
- **S2 (aprobación):** No aún (uso interno). Con clientes externos, estado "revisión".
- **S3 (DM social al inbox):** No aún — depende de W4.

## 8. Captación (Tally)

- **T1 (ruteo):** Sí — lead de Tally → asignar agente (F4) + tarea "primer contacto" 24h (F6).
- **T2 (auto-respuesta):** Sí — agradecimiento por Resend con plantilla por tenant. S.
- **T3 (formularios nativos):** No — seguir Tally (el webhook ya es sólido: HMAC + UNIQUE + transacción).

## 9. Notificaciones y digest

- **N1 (digest por agente):** Sí — separar por `assignee` y enviar a cada usuario; el general queda para admins. M.
- **N2 (sin respuesta):** Sí — conversación abierta sin respuesta del agente > X horas → campana. Default 4h laborables, configurable por tenant.
- **N3 (Slack/Telegram):** No aún.
- **N4 (prioridades en campana):** No aún.

## 10. IA

- **I1 (sugerir respuesta):** Sí — botón en el chat que usa resumen + últimos mensajes → borrador editable. Groq ya pagado; mejor valor/esfuerzo del módulo.
- **I2 (clasificación de leads):** No aún.
- **I3 (transcripción de notas de voz):** No aún.
- **I4 (tope de coste):** Sí — cap mensual de llamadas por tenant en company-settings + corte en sweep con aviso al admin.

## 11. Roles y seguridad

- **R1 (roles):** Fase 1 YA (fix crítico): whitelist de invitación (agente/viewer), solo superadmin crea admins globales, constraint de tenant en `Users.update`. Fase 2: roles por tenant si hay clientes externos.
- **R2 (permisos por módulo):** No aún — admin/agente/viewer + ocultar módulos basta para equipo interno.
- **R3 (auditoría):** Sí básico — hook en collections de dinero (payments/quotes/invoices/memberships) registrando quién cambió qué. M.
- **R4 (2FA):** Antes de multi-cliente sí; con equipo interno hoy no urgente (ya hay lockout a 5 intentos).
- **R5 (export pre-delete):** Sí — CSV del tenant antes del cascade. S.
- **R6 (SSO):** No.

## 12. UI/UX

- **U1 (idioma):** Español only. No externalizar copy aún; reversible si U2 cambia.
- **U2 (audiencia): [A — confirma]** Equipo interno de la agencia (todo el código apunta a eso: admin como escape hatch, copy es, USD único).
- **U3 (PWA):** No aún.
- **U4 (onboarding de tenant):** Sí — checklist simple: conectar WhatsApp (org/phone), invitar equipo, crear rubros, importar leads. S-M.
- **U5 (modo claro):** No.

## 13. Infraestructura

- **X1 (observabilidad):** Sí — Sentry + alerta de cron fallido (el digest puede fallar en silencio: catches que tragan errores, hallazgo H11). S, valor alto.
- **X2 (staging):** Sí — Neon branch + preview Vercel (ya estaba en Sprint 0 del plan previo).
- **X3 (crons a Vercel):** Sí — `vercel.json` crons elimina la dependencia de GH Actions; `CRON_SECRET` funciona igual.
- **X4 (tamaño objetivo): [A — la más importante]** Asumo 5–10 tenants y <1.000 contactos/tenant en 6 meses. Con eso: pool actual OK, Resend std, buzón compartido aguanta. Si es 50+: E1/E3/R1 pasan de "fase 2" a "obligatorio ya".

---

## Secuencia de ejecución propuesta (con estas respuestas)

1. **Fixes de seguridad/auditoría (1–2 días):** R1 fase 1, escape de variables de campaña (C6/H1), watchdog C10/H8, field-access en `aiApiKey`, `PAYLOAD_SECRET` sin fallback.
2. **WhatsApp que sí sirve (1 semana):** W2 (plantillas fuera de ventana), W5 (ticks), W6 (asignación), W8 (cierre).
3. **Campañas serias (1 semana):** C2 (preview/prueba), C3 (unsubscribe), E8 (supresión), C5 (auto-send + horario), C7 parcial (dashboard de entrega).
4. **Operación (3–4 días):** X1, X3, A4, B4, B6, N1, T1/T2, F2/F4/F6.
5. **Fase 2 (según X4/U2):** E1/E3 (email y dominio por tenant), W3 (broadcast WA), C4 (reglas), R1 fase 2, A1 (citas → gcal), I1.
