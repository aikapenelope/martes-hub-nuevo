'use client'

/**
 * HoyPage — `/workspace/hoy`. A quién escribirle hoy, ordenado por urgencia.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Skeleton } from '@/components/workspace/ui'
import { HeroAction, PageHero } from '@/components/workspace/oled'

interface FollowUpItem {
  kind: 'lead' | 'client'
  id: number
  name: string
  phone: string
  pipeline: string
  daysSince: number
  reason: string
  priority: number
  waLink: string
  crmUrl: string
}

export default function HoyPage() {
  const [items, setItems] = useState<FollowUpItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    try {
      const res = await fetch('/api/followups/hoy', { credentials: 'include' })
      if (!res.ok) {
        throw new Error(res.status === 401 ? 'Sesión expirada — recargá la página' : `Error ${res.status}`)
      }
      const data = (await res.json()) as { items: FollowUpItem[] }
      setItems(data.items)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error inesperado')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Carga inicial al montar; los setState ocurren después del await (no son síncronos)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      <PageHero
        eyebrow="Seguimientos"
        title="Hoy"
        description="A quién escribirle hoy. El primer mensaje lo abrís vos; cuando respondan, el agente sigue solo."
        actions={
          <HeroAction type="button" onClick={() => void load(true)} icon={RefreshCw}>
            {loading ? 'Cargando…' : 'Refrescar'}
          </HeroAction>
        }
      />

      {error && (
        <div className="oled-card border-red-900/60 px-3 py-2 text-xs text-red-300">{error}</div>
      )}

      {loading && items.length === 0 && (
        <div className="border border-zinc-800 bg-zinc-950 p-4 space-y-3" aria-hidden="true">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <OledCard className="py-12 text-center text-sm text-zinc-400">Nada pendiente por hoy.</OledCard>
      )}

      {items.length > 0 && (
        <div className="border border-zinc-800 bg-zinc-950">
          {items.map((item) => (
            <div key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center gap-4 border-b border-zinc-900 px-4 py-3 last:border-0">
              <span className={`shrink-0 text-[10px] font-mono px-1.5 py-0.5 ${item.kind === 'lead' ? 'bg-amber-900/50 text-amber-300 border border-amber-800' : 'bg-emerald-900/50 text-emerald-400 border border-emerald-800'}`}>
                {item.kind === 'lead' ? 'Lead' : 'Cliente'}
              </span>
              <strong className="min-w-[10rem] text-sm text-white">{item.name}</strong>
              <span className="text-xs text-zinc-400">{item.pipeline}</span>
              <span className="flex-1 text-xs text-zinc-300">{item.reason}</span>
              <a href={item.crmUrl} className="text-xs text-zinc-400 hover:text-white underline">Ver ficha</a>
              <a
                href={item.waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 px-3 py-1.5 bg-[#25d366] text-black text-xs font-bold uppercase tracking-wider font-mono"
              >
                WhatsApp
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
