'use client'

import { useRef } from 'react'
import { Plus, X } from 'lucide-react'

import { createClientAction, createLeadAction } from '@/lib/crm-actions'

interface CrmFormDialogProps {
  kind: 'lead' | 'client'
  /** 'primary': botón blanco (CRM header) · 'secondary': estilo oled del cockpit */
  variant?: 'primary' | 'secondary'
  label?: string
}

const inputCls = 'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

export function CrmFormDialog({ kind, variant = 'primary', label }: CrmFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isLead = kind === 'lead'
  const btnCls =
    variant === 'primary'
      ? 'px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono inline-flex items-center gap-1.5'
      : 'px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold flex items-center gap-2 uppercase transition text-xs font-mono'

  return (
    <>
      <button
        className={btnCls}
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Plus aria-hidden="true" size={16} />
        {label ?? (isLead ? 'Crear lead' : 'Crear cliente')}
      </button>

      <dialog
        className="workspace-dialog m-auto w-full max-w-lg border border-zinc-800 bg-zinc-950 p-0 text-white"
        aria-label={isLead ? 'Nuevo lead' : 'Nuevo cliente'}
        ref={dialogRef}
        onCancel={() => dialogRef.current?.close()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-4">
          <div>
            <h2 className="text-base font-bold text-white">{isLead ? 'Nuevo lead' : 'Nuevo cliente'}</h2>
            <p className="mt-1 text-xs text-zinc-400">Se guardará en el tenant activo y quedará registrado en el timeline.</p>
          </div>
          <button
            aria-label="Cerrar formulario"
            className="flex h-8 w-8 items-center justify-center border border-zinc-800 text-zinc-400 hover:text-white"
            type="button"
            onClick={() => dialogRef.current?.close()}
          >
            <X aria-hidden="true" size={16} />
          </button>
        </div>
        <form action={isLead ? createLeadAction : createClientAction} className="flex flex-col gap-3 p-4">
          <label className={labelCls}>
            {isLead ? 'Nombre completo' : 'Nombre del cliente'}
            <input name={isLead ? 'fullName' : 'name'} maxLength={160} required autoFocus className={inputCls} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelCls}>
              Email
              <input name="email" type="email" maxLength={240} autoComplete="email" className={inputCls} />
            </label>
            <label className={labelCls}>
              Teléfono
              <input name="phone" type="tel" maxLength={80} autoComplete="tel" className={inputCls} />
            </label>
          </div>
          <label className={labelCls}>
            {isLead ? 'Estado inicial' : 'Etapa inicial'}
            <select name={isLead ? 'status' : 'stage'} defaultValue="nuevo" className={inputCls}>
              {isLead ? (
                <>
                  <option value="nuevo">Nuevo</option>
                  <option value="contactado">Contactado</option>
                  <option value="calificado">Calificado</option>
                  <option value="descartado">Descartado</option>
                </>
              ) : (
                <>
                  <option value="nuevo">Nuevo</option>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                  <option value="perdido">Perdido</option>
                </>
              )}
            </select>
          </label>
          {!isLead && (
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input name="consent" type="checkbox" /> Cuenta con consentimiento de contacto
            </label>
          )}
          <label className={labelCls}>
            Notas internas
            <textarea name="notes" rows={4} maxLength={4000} className={inputCls} />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono"
              type="button"
              onClick={() => dialogRef.current?.close()}
            >
              Cancelar
            </button>
            <button className="px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono" type="submit">
              Guardar {isLead ? 'lead' : 'cliente'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
