'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'

import { inviteUserAction } from '@/lib/team-actions'
import { Drawer } from '@/components/workspace/overlays'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

/** Reemplaza crear un usuario desde `/admin/collections/users/create`. Solo admins (gateado por el caller). */
export function InviteUserDialog() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="px-4 py-2 bg-sky-400 hover:bg-sky-300 text-black font-black flex items-center gap-2 uppercase transition shadow-[0_0_16px_rgba(56,189,248,0.35)] text-xs font-mono"
        onClick={() => setOpen(true)}
      >
        <Plus className="w-4 h-4" /> + Invitar
      </button>

      <Drawer open={open} onClose={() => setOpen(false)} title="Invitar Miembro al Equipo" size="md">

        <form action={inviteUserAction} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              Nombre
              <input name="firstName" maxLength={100} className={inputCls} />
            </label>
            <label className={labelCls}>
              Apellido
              <input name="lastName" maxLength={100} className={inputCls} />
            </label>
          </div>
          <label className={labelCls}>
            Email
            <input name="email" type="email" required className={inputCls} />
          </label>
          <label className={labelCls}>
            Contraseña temporal (mín. 8 caracteres)
            <input name="password" type="text" required minLength={8} className={inputCls} />
          </label>
          <fieldset className={labelCls}>
            Roles
            <div className="mt-1 flex flex-col gap-1.5 text-xs text-zinc-300">
              <label className="flex items-center gap-2"><input type="checkbox" name="roles" value="admin" /> Admin — gestiona todo</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="roles" value="agente" defaultChecked /> Agente — opera CRM</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="roles" value="viewer" /> Viewer — solo lectura</label>
            </div>
          </fieldset>
          <p className="text-[11px] text-zinc-500">
            Comparte la contraseña temporal por un canal seguro. El nuevo usuario puede cambiarla
            desde &quot;¿Olvidaste tu contraseña?&quot; en el login.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono"
            >
              Cancelar
            </button>
            <button type="submit" className="px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono">
              Crear usuario
            </button>
          </div>
        </form>
      </Drawer>
    </>
  )
}
