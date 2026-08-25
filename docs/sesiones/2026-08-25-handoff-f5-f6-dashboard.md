# Handoff fin de día — 2026-08-25 (post F5/F6b/CSV)

> Para retomar: leer este archivo + tabla de estado en `README.md`.

## Dónde estamos
- **Mergeados hoy**: #13 (F4 lista Hoy), #14 (F5 email Resend), #15 (plugin import-export oficial)
- **#16 abierto y verde**: facturación/cotizaciones (`payload-invoicepdf`) + colección `offers` + Apify descartada → **merge del dueño**
- Conflictos de #16 ya resueltos (integraba #15); Vercel SUCCESS

## Mañana (en orden)
1. Merge #16 (dueño)
2. **Dashboard de inicio** — fase nueva sin número en README: vista `/admin/dashboard` reutilizando `/api/followups/hoy` + cobros + conversaciones sin responder + números rápidos. Patrón: igual que `Hoy.tsx`/`Inbox.tsx`
3. **F8 Formularios (Tally)**: webhook HMAC `/api/webhooks/tally`, colección `form-submissions` tenant-aware, matching a clients, notificaciones por queja

## Bloqueado por el dueño (recordar)
- OpenBSP hosted: org + número + API keys + agente LLM → cierra F4 con E2E real
- Resend: dominio + `RESEND_API_KEY` + webhook secret → activa F5
- Deudas: revocar key Neon vieja (`napi_…`), CI GitHub Actions, verificar crons del scheduler externo

## Convenciones que no cambian
- `pnpm verify` antes de cada push · migraciones vía expect script (`/tmp/opencode/*.exp`) · commits convencionales · NUNCA mergear el agente
- Node ≥24.15: `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH" && hash -r`
