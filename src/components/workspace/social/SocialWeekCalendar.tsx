'use client'

import { Share2 } from 'lucide-react'
import type { SocialPost, SocialAccount } from '@/payload-types'

export function SocialWeekCalendar({ posts, weekStart }: { posts: SocialPost[], weekStart: string }) {
  const monday = new Date(weekStart)
  const now = new Date()
  const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
  
  const weekDays = dayNames.map((name, index) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + index)
    const dIsoPrefix = d.toISOString().split('T')[0]
    const dayPosts = posts.filter((p) => {
      const ref = p.scheduledAt || p.publishedAt || p.createdAt
      return ref && ref.startsWith(dIsoPrefix)
    })
    return {
      name,
      dayNum: d.getDate(),
      isToday: d.toDateString() === now.toDateString(),
      dayPosts,
    }
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'programado': return 'bg-amber-500/20 text-amber-500 border-amber-500/30'
      case 'publicado': return 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30'
      case 'fallido': return 'bg-red-500/20 text-red-500 border-red-500/30'
      default: return 'bg-zinc-800 text-zinc-300 border-zinc-700'
    }
  }

  const getPlatformIcon = (account: any) => {
    const platform = typeof account === 'object' && account ? account.platform : null
    if (platform === 'facebook') return <span className="text-[10px] font-bold">FB</span>
    if (platform === 'instagram') return <span className="text-[10px] font-bold">IG</span>
    return <Share2 size={12} className="shrink-0" />
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
      {weekDays.map((day) => (
        <div 
          key={day.name} 
          className={`flex flex-col min-h-[100px] border ${day.isToday ? 'border-white bg-zinc-900/80' : 'border-zinc-800 bg-zinc-950'} p-2 rounded-sm`}
        >
          <div className="flex justify-between items-center mb-2 border-b border-zinc-800 pb-1">
            <span className="text-[10px] text-zinc-500 font-mono uppercase">{day.name}</span>
            <span className={`text-sm font-bold ${day.isToday ? 'text-white' : 'text-zinc-400'}`}>{day.dayNum}</span>
          </div>
          
          <div className="flex flex-col gap-1.5 flex-1">
            {day.dayPosts.length === 0 ? (
              <div className="text-[10px] text-zinc-600 italic text-center my-auto py-2">Sin publicaciones</div>
            ) : (
              day.dayPosts.map(p => (
                <div key={p.id} className={`flex flex-col p-1.5 border rounded-sm ${getStatusColor(p.status)}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {getPlatformIcon(p.account)}
                    <span className="text-[9px] font-bold uppercase tracking-wider truncate">{p.status}</span>
                  </div>
                  <div className="text-[10px] leading-tight line-clamp-2" title={p.caption}>
                    {p.caption.length > 40 ? p.caption.slice(0, 40) + '...' : p.caption}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
