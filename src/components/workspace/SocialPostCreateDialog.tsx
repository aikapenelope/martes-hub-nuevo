'use client'

import { useState } from 'react'
import { Plus, Share2 } from 'lucide-react'
import { Drawer } from '@/components/workspace/overlays'
import { createSocialPostAction } from '@/lib/social-actions'
import type { SocialAccount } from '@/payload-types'

const inputCls =
  'w-full border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600'
const labelCls = 'flex flex-col gap-1 text-xs font-mono uppercase tracking-wider text-zinc-400'

export function SocialPostCreateDialog({ accounts }: { accounts: SocialAccount[] }) {
  const [open, setOpen] = useState(false)
  const [caption, setCaption] = useState('')
  const [accountId, setAccountId] = useState('')

  const selectedAccount = accounts.find(a => String(a.id) === accountId)
  const platform = selectedAccount?.platform

  return (
    <>
      <button
        type="button"
        className="px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-bold transition inline-flex items-center gap-1.5 uppercase tracking-wider font-mono"
        onClick={() => setOpen(true)}
      >
        <Plus size={16} /> Programar post
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Programar Nueva Publicación"
        size="xl"
      >
        {accounts.length === 0 ? (
          <p className="p-4 text-xs text-zinc-400">
            No hay cuentas sociales conectadas todavía. Conecta una cuenta primero.
          </p>
        ) : (
          <form action={createSocialPostAction} className="flex flex-col gap-5 p-4 flex-1">
            <label className={labelCls}>
              Cuenta de destino
              <div className="relative">
                {platform === 'facebook' && <span className="absolute left-3 top-2.5 text-[10px] font-bold text-zinc-400 mt-1">FB</span>}
                {platform === 'instagram' && <span className="absolute left-3 top-2.5 text-[10px] font-bold text-zinc-400 mt-1">IG</span>}
                <select 
                  name="account" 
                  required 
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className={`${inputCls} ${platform ? 'pl-9' : ''}`}
                >
                  <option value="" disabled>Selecciona una cuenta</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.accountName}</option>
                  ))}
                </select>
              </div>
            </label>
            <label className={labelCls}>
              <div className="flex justify-between items-center w-full">
                <span>Copy / texto del post</span>
                <span className={caption.length > 2200 ? 'text-red-500' : 'text-zinc-500'}>{caption.length}/2200</span>
              </div>
              <textarea 
                name="caption" 
                rows={6} 
                required 
                maxLength={2200} 
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className={inputCls} 
                placeholder="Escribe el contenido de tu publicación..."
              />
            </label>
            
            {/* Live Preview */}
            <div className="border border-zinc-800 p-4 rounded bg-zinc-900/50">
              <div className="text-xs font-bold text-zinc-500 mb-2 font-mono uppercase">Preview del Caption</div>
              <div className="text-sm text-zinc-300 whitespace-pre-wrap break-words">
                {caption || <span className="text-zinc-600 italic">Aquí aparecerá el texto de tu publicación...</span>}
              </div>
            </div>

            <label className={labelCls}>
              Programar para (déjalo vacío para guardar como borrador)
              <input name="scheduledAt" type="datetime-local" className={inputCls} />
            </label>
            <p className="text-[11px] text-zinc-500 mt-auto">
              Esto solo deja el contenido listo. La publicación real la hace el agente MCP
              conectado a Metricool/Composio.
            </p>
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold uppercase tracking-wider font-mono"
              >
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-wider font-mono">
                Guardar
              </button>
            </div>
          </form>
        )}
      </Drawer>
    </>
  )
}
