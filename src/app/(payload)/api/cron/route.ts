/**
 * Vercel Cron trigger para el job queue de Payload.
 *
 * Vercel Cron envía GET requests. Este handler:
 * 1. Valida el `CRON_SECRET` (Vercel lo inyecta en Authorization: Bearer).
 * 2. Llama a payload.jobs.run() via Local API — sin req de usuario, con overrideAccess: true
 *    porque es una operación de sistema (QUERIES.md: "Administrative operations").
 * 3. Devuelve un JSON con el resultado para los logs de Vercel.
 *
 * Configurar en vercel.json:
 *   "crons": [{ "path": "/api/cron", "schedule": "* /5 * * * *" }]
 *
 * Configurar en las variables de entorno de Vercel:
 *   CRON_SECRET=<random-secret> (Vercel lo añade automáticamente en proyectos Vercel Cron)
 */

import configPromise from '@payload-config'
import { timingSafeEqual } from 'crypto'
import { getPayload } from 'payload'

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function GET(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET

  // Fail-closed: sin CRON_SECRET configurado, el endpoint rechaza todo en
  // vez de ejecutar sin autenticación.
  if (!cronSecret) {
    return Response.json({ error: 'CRON_SECRET no configurado' }, { status: 503 })
  }
  if (!authHeader || !safeEqual(authHeader, `Bearer ${cronSecret}`)) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const payload = await getPayload({ config: configPromise })
    const result = await payload.jobs.run()

    payload.logger.info({ msg: 'cron: job queue ejecutado', result })

    return Response.json({ ok: true, result })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return Response.json({ error: message }, { status: 500 })
  }
}
