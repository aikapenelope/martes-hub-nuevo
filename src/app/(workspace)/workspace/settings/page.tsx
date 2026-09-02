import 'server-only'

import { CheckCircle2, Building, Shield } from 'lucide-react'
import { getWorkspaceContext } from '@/lib/workspace-context'
import { updateCompanySettingsAction } from '@/lib/settings-actions'
import type { CompanySetting } from '@/payload-types'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600 font-sans'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const { saved } = await searchParams
  const context = await getWorkspaceContext()

  // Obtener settings existentes
  const settingsRes = await context.payload.find({
    collection: 'company-settings',
    where: { tenant: { equals: context.tenantId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })

  const settings: CompanySetting | undefined = settingsRes.docs[0] as CompanySetting | undefined

  const companyName = settings?.companyName || context.tenant.name
  const timezone = settings?.timezone || 'America/Caracas'
  const currency = settings?.currency || 'USD'
  const digestHour = settings?.digestHour ?? 8
  const internalNotificationsEmail = settings?.internalNotificationsEmail || ''

  const isAdmin = Boolean(context.user.roles?.includes('admin'))

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <section className="border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-mono text-zinc-400 uppercase tracking-wider">
              <span className="w-2 h-2 bg-white inline-block" />
              <span>Configuración · {context.tenant.name}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Ajustes del Negocio
            </h1>
            <p className="mt-1 text-xs text-zinc-400">
              Preferencias operativas, zona horaria de crons y canal de reportes del tenant activo.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-zinc-400 border border-zinc-800 bg-zinc-900 px-3 py-1.5 inline-flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-zinc-400" />
              Rol: {context.user.roles?.join(', ')}
            </span>
          </div>
        </div>
      </section>

      {saved && (
        <div
          className="flex items-center gap-2 border border-emerald-800 bg-emerald-900/30 px-3 py-2 text-xs text-emerald-300 font-mono"
          role="status"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400" aria-hidden="true" />
          Ajustes actualizados correctamente en el tenant activo.
        </div>
      )}

      {/* Grid de metadata del tenant */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="oled-card p-4">
          <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Tenant Activo</p>
          <p className="mt-1 text-lg font-bold text-white truncate">{context.tenant.name}</p>
          <span className="text-[10px] text-zinc-500 font-mono">ID: {context.tenant.id}</span>
        </div>
        <div className="oled-card p-4">
          <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Slug / Identificador</p>
          <p className="mt-1 text-lg font-mono font-bold text-white">{context.tenant.slug}</p>
          <span className="text-[10px] text-zinc-500 font-mono">Espacio aislado multi-tenant</span>
        </div>
        <div className="oled-card p-4">
          <p className="text-xs text-zinc-400 font-mono uppercase tracking-wider">Moneda Operativa</p>
          <p className="mt-1 text-lg font-mono font-bold text-emerald-400">{currency}</p>
          <span className="text-[10px] text-zinc-500 font-mono">Dólares estadounidenses</span>
        </div>
      </section>

      {/* Formulario de configuración */}
      <section className="oled-card p-6">
        <div className="flex items-center gap-2 pb-4 border-b border-zinc-800">
          <Building className="w-4 h-4 text-white" />
          <h2 className="text-sm font-bold uppercase tracking-wider font-mono text-white">
            Parámetros de la Empresa
          </h2>
        </div>

        {isAdmin ? (
          <form action={updateCompanySettingsAction} className="mt-5 space-y-4">
            <input type="hidden" name="tenantId" value={context.tenant.id} />
            <label className={labelCls}>
              Nombre comercial de la empresa
              <input
                name="companyName"
                defaultValue={companyName}
                required
                maxLength={120}
                className={inputCls}
                placeholder="Ej: Storelink Corp"
              />
              <span className="text-[11px] text-zinc-500 font-sans normal-case">
                Se mostrará en la cabecera del workspace y en las comunicaciones comerciales.
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelCls}>
                Zona Horaria (Timezone)
                <select name="timezone" defaultValue={timezone} className={inputCls}>
                  <option value="America/Caracas">America/Caracas (UTC-4)</option>
                  <option value="America/Bogota">America/Bogota (UTC-5)</option>
                  <option value="America/Mexico_City">America/Mexico_City (UTC-6)</option>
                  <option value="America/Santiago">America/Santiago (UTC-3)</option>
                  <option value="America/Argentina/Buenos_Aires">America/Buenos_Aires (UTC-3)</option>
                  <option value="America/New_York">America/New_York (UTC-5)</option>
                  <option value="Europe/Madrid">Europe/Madrid (UTC+1)</option>
                  <option value="UTC">UTC (Tiempo Universal)</option>
                </select>
                <span className="text-[11px] text-zinc-500 font-sans normal-case">
                  Afecta el cálculo del briefing diario, agenda y tareas.
                </span>
              </label>

              <label className={labelCls}>
                Moneda Base
                <select name="currency" defaultValue={currency} className={inputCls}>
                  <option value="USD">USD ($ - Dólares Estadounidenses)</option>
                </select>
                <span className="text-[11px] text-zinc-500 font-sans normal-case">
                  Moneda predeterminada para cotizaciones y cobranzas.
                </span>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelCls}>
                Hora del Digest Diario (0 a 23h local)
                <input
                  name="digestHour"
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={digestHour}
                  required
                  className={inputCls}
                />
                <span className="text-[11px] text-zinc-500 font-sans normal-case">
                  Hora en la que se despacha el resumen matutino de actividades.
                </span>
              </label>

              <label className={labelCls}>
                Email de Notificaciones Internas
                <input
                  name="internalNotificationsEmail"
                  type="email"
                  defaultValue={internalNotificationsEmail}
                  maxLength={240}
                  placeholder="admin@tuempresa.com"
                  className={inputCls}
                />
                <span className="text-[11px] text-zinc-500 font-sans normal-case">
                  Receptor de alertas del sistema y reportes consolidados.
                </span>
              </label>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="px-5 py-2.5 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono hover:bg-zinc-200 transition"
              >
                Guardar Ajustes
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-4 p-4 border border-zinc-800 bg-black text-xs text-zinc-400 font-mono">
            Modo solo lectura — se requiere rol admin para modificar los parámetros del negocio.
          </div>
        )}
      </section>
    </div>
  )
}
