'use client'

import { useRef } from 'react'
import { Plus, X } from 'lucide-react'

import { createClientAction, createLeadAction } from '../actions'

interface CrmFormDialogProps {
  kind: 'lead' | 'client'
}

export function CrmFormDialog({ kind }: CrmFormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isLead = kind === 'lead'

  return (
    <>
      <button
        className="workspace-button workspace-button-primary"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Plus aria-hidden="true" size={16} />
        {isLead ? 'Crear lead' : 'Crear cliente'}
      </button>

      <dialog className="crm-dialog" ref={dialogRef} onCancel={() => dialogRef.current?.close()}>
        <div className="crm-dialog-head">
          <div>
            <h2>{isLead ? 'Nuevo lead' : 'Nuevo cliente'}</h2>
            <p>Se guardará en el tenant activo y quedará registrado en el timeline.</p>
          </div>
          <button
            aria-label="Cerrar formulario"
            className="workspace-icon-button"
            type="button"
            onClick={() => dialogRef.current?.close()}
          >
            <X aria-hidden="true" size={17} />
          </button>
        </div>
        <form action={isLead ? createLeadAction : createClientAction} className="crm-form">
          <label className="crm-field">
            <span>{isLead ? 'Nombre completo' : 'Nombre del cliente'}</span>
            <input name={isLead ? 'fullName' : 'name'} maxLength={160} required autoFocus />
          </label>
          <div className="crm-form-grid">
            <label className="crm-field">
              <span>Email</span>
              <input name="email" type="email" maxLength={240} autoComplete="email" />
            </label>
            <label className="crm-field">
              <span>Teléfono</span>
              <input name="phone" type="tel" maxLength={80} autoComplete="tel" />
            </label>
          </div>
          <label className="crm-field">
            <span>{isLead ? 'Estado inicial' : 'Etapa inicial'}</span>
            <select name={isLead ? 'status' : 'stage'} defaultValue="nuevo">
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
            <label className="crm-checkbox">
              <input name="consent" type="checkbox" />
              <span>Cuenta con consentimiento de contacto</span>
            </label>
          )}
          <label className="crm-field">
            <span>Notas internas</span>
            <textarea name="notes" rows={4} maxLength={4000} />
          </label>
          <div className="crm-dialog-actions">
            <button className="workspace-button" type="button" onClick={() => dialogRef.current?.close()}>
              Cancelar
            </button>
            <button className="workspace-button workspace-button-primary" type="submit">
              Guardar {isLead ? 'lead' : 'cliente'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
