'use client'

import { useState, type ReactNode } from 'react'
import {
  Building2,
  DollarSign,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Plus,
  ShieldCheck,
  User,
  Sparkles,
} from 'lucide-react'

import { Drawer } from '@/components/workspace/overlays'
import { createClientAction, createCompanyAction, createLeadAction } from '@/lib/crm-actions'
import type { LeadStatus } from '@/lib/crm-filters'

export interface CrmSlideOverDrawerProps {
  kind: 'lead' | 'client' | 'company'
  variant?: 'primary' | 'secondary' | 'ghost' | 'inline'
  label?: string
  initialStatus?: LeadStatus
  redirectTo?: string
  open?: boolean
  onClose?: () => void
  trigger?: ReactNode
}

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 transition-colors font-sans'
const labelCls = 'flex flex-col gap-1.5 text-[11px] font-mono uppercase tracking-wider text-zinc-400'

const STATUS_OPTIONS: { value: LeadStatus; label: string; badgeCls: string }[] = [
  { value: 'nuevo', label: 'Nuevo', badgeCls: 'border-blue-800 bg-blue-950/40 text-blue-300' },
  { value: 'contactado', label: 'Contactado', badgeCls: 'border-amber-800 bg-amber-950/40 text-amber-300' },
  { value: 'calificado', label: 'Calificado', badgeCls: 'border-emerald-800 bg-emerald-950/40 text-emerald-300' },
  { value: 'descartado', label: 'Descartado', badgeCls: 'border-zinc-800 bg-zinc-900 text-zinc-500' },
]

export function CrmSlideOverDrawer({
  kind,
  variant = 'primary',
  label,
  initialStatus = 'nuevo',
  redirectTo,
  open: controlledOpen,
  onClose: controlledOnClose,
  trigger,
}: CrmSlideOverDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [status, setStatus] = useState<LeadStatus>(initialStatus)
  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : internalOpen

  const handleClose = () => {
    if (isControlled) {
      controlledOnClose?.()
    } else {
      setInternalOpen(false)
    }
  }

  const handleOpen = () => {
    if (!isControlled) {
      setInternalOpen(true)
    }
  }

  const isLead = kind === 'lead'
  const isCompany = kind === 'company'

  const entityTitle = isLead ? 'lead' : isCompany ? 'empresa' : 'cliente'
  const drawerTitle = isLead
    ? 'Alta de Prospecto · Pipeline'
    : isCompany
      ? 'Registro de Empresa · B2B'
      : 'Nuevo Cliente · Cartera'

  const btnCls =
    variant === 'primary'
      ? 'px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono inline-flex items-center gap-1.5 hover:bg-zinc-200 transition'
      : variant === 'ghost'
        ? 'inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 hover:text-white px-1.5 py-0.5 border border-zinc-800 hover:border-zinc-600 bg-zinc-900 transition'
        : variant === 'inline'
          ? 'inline-flex items-center gap-1 rounded text-[11px] font-mono font-medium text-zinc-300 hover:text-white transition'
          : 'px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-bold flex items-center gap-2 uppercase transition text-xs font-mono'

  return (
    <>
      {trigger ? (
        <span onClick={handleOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleOpen()}>
          {trigger}
        </span>
      ) : (
        <button className={btnCls} type="button" onClick={handleOpen}>
          <Plus aria-hidden="true" size={variant === 'ghost' ? 12 : 15} />
          {label ?? (isLead ? 'Crear lead' : isCompany ? 'Crear empresa' : 'Crear cliente')}
        </button>
      )}

      <Drawer open={isOpen} onClose={handleClose} title={drawerTitle} size="xl">
        <div className="flex flex-col gap-5 pb-6">
          {/* Subheader descriptivo con badge de radar */}
          <div className="border border-zinc-850 bg-zinc-900/40 p-3">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Radar Comercial 360° · Martes Hub</span>
            </div>
            <p className="mt-1 text-xs text-zinc-300">
              {isLead
                ? 'Incorpora una nueva oportunidad al radar comercial con su velocidad y valor proyectado.'
                : isCompany
                  ? 'Registra una cuenta corporativa para centralizar contactos, tratos y facturación.'
                  : 'Registra un cliente activo en la cartera con seguimiento de estado y consentimiento.'}
            </p>
          </div>

          <form
            action={isLead ? createLeadAction : isCompany ? createCompanyAction : createClientAction}
            className="flex flex-col gap-4"
          >
            {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}

            {/* Selector visual de estado (para Leads) */}
            {isLead && (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  Columna Inicial en Pipeline
                </span>
                <input type="hidden" name="status" value={status} />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {STATUS_OPTIONS.map((opt) => {
                    const isSelected = status === opt.value
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setStatus(opt.value)}
                        className={`px-2.5 py-2 text-center text-xs font-mono font-medium border transition-all ${
                          isSelected
                            ? `${opt.badgeCls} ring-1 ring-white/20 font-bold`
                            : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Panel 1: Datos Principales / Identidad */}
            <div className="border border-zinc-850 bg-zinc-950 p-3.5 flex flex-col gap-3">
              <div className="flex items-center gap-1.5 border-b border-zinc-850 pb-2 text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300">
                <User size={13} className="text-zinc-400" />
                <span>Identidad del {entityTitle}</span>
              </div>

              <label className={labelCls}>
                {isLead ? 'Nombre completo o Contacto' : isCompany ? 'Razón Social / Nombre' : 'Nombre del cliente'}
                <input
                  name={isLead ? 'fullName' : 'name'}
                  maxLength={160}
                  required
                  autoFocus
                  placeholder={isLead ? 'Ej: Carlos Mendoza' : isCompany ? 'Ej: Soluciones Digitales C.A.' : 'Ej: María Gómez'}
                  className={inputCls}
                />
              </label>

              {isCompany && (
                <label className={labelCls}>
                  Documento Fiscal / RIF / CIF
                  <input name="taxId" maxLength={50} placeholder="Ej: J-12345678-9" className={inputCls} />
                </label>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  <span className="flex items-center gap-1">
                    <MessageCircle size={12} className="text-[#25d366]" />
                    <span>Teléfono (WhatsApp)</span>
                  </span>
                  <input
                    name="phone"
                    type="tel"
                    maxLength={80}
                    autoComplete="tel"
                    placeholder="Ej: +58 412 1234567"
                    className={inputCls}
                  />
                </label>

                <label className={labelCls}>
                  <span className="flex items-center gap-1">
                    <Mail size={12} className="text-zinc-400" />
                    <span>Correo electrónico</span>
                  </span>
                  <input
                    name="email"
                    type="email"
                    maxLength={240}
                    autoComplete="email"
                    placeholder="contacto@empresa.com"
                    className={inputCls}
                  />
                </label>
              </div>
            </div>

            {/* Panel 2: Contexto Comercial & Cuenta */}
            <div className="border border-zinc-850 bg-zinc-950 p-3.5 flex flex-col gap-3">
              <div className="flex items-center gap-1.5 border-b border-zinc-850 pb-2 text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300">
                <Building2 size={13} className="text-zinc-400" />
                <span>Contexto Comercial</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {!isCompany && (
                  <label className={labelCls}>
                    Empresa / Negocio
                    <input
                      name="companyName"
                      maxLength={160}
                      placeholder="Ej: Corporación Andina"
                      className={inputCls}
                    />
                  </label>
                )}

                {isLead && (
                  <label className={labelCls}>
                    <span className="flex items-center gap-1">
                      <DollarSign size={12} className="text-emerald-400" />
                      <span>Valor Estimado (USD)</span>
                    </span>
                    <input
                      name="estimatedValue"
                      type="number"
                      min={0}
                      step={1}
                      placeholder="Ej: 1500"
                      className={`${inputCls} font-mono font-bold text-emerald-400`}
                    />
                  </label>
                )}

                <label className={labelCls}>
                  <span className="flex items-center gap-1">
                    <MapPin size={12} className="text-zinc-400" />
                    <span>Ciudad / Ubicación</span>
                  </span>
                  <input name="city" maxLength={100} placeholder="Ej: Caracas, Valencia..." className={inputCls} />
                </label>

                {isCompany && (
                  <label className={labelCls}>
                    <span className="flex items-center gap-1">
                      <Globe size={12} className="text-zinc-400" />
                      <span>Sitio web</span>
                    </span>
                    <input name="website" maxLength={255} placeholder="https://ejemplo.com" className={inputCls} />
                  </label>
                )}
              </div>

              {!isLead && !isCompany && (
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  <label className={labelCls}>
                    Etapa de cliente
                    <select name="stage" defaultValue="nuevo" className={inputCls}>
                      <option value="nuevo">Nuevo</option>
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                      <option value="perdido">Perdido</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-2 text-xs text-zinc-300 mt-5">
                    <input name="consent" type="checkbox" className="accent-emerald-500" />
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck size={13} className="text-emerald-400" />
                      Consentimiento de contacto
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Panel 3: Notas & Observaciones */}
            <div className="border border-zinc-850 bg-zinc-950 p-3.5 flex flex-col gap-2">
              <label className={labelCls}>
                Notas Comerciales & Requerimientos
                <textarea
                  name="notes"
                  rows={4}
                  maxLength={4000}
                  placeholder="Detalles sobre necesidades del prospecto, productos de interés o acuerdos previos..."
                  className={inputCls}
                />
              </label>
            </div>

            {/* Footer de Acciones */}
            <div className="flex items-center justify-between gap-3 border-t border-zinc-800/80 pt-4 mt-2">
              <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-500">
                <Sparkles size={11} className="text-sky-400" />
                <span>Quedará registrado en el timeline</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-bold uppercase tracking-wider font-mono transition inline-flex items-center gap-1.5"
                >
                  <Plus size={14} />
                  Guardar {entityTitle}
                </button>
              </div>
            </div>
          </form>
        </div>
      </Drawer>
    </>
  )
}
