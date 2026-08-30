'use client'

import type { Activity } from '@/payload-types'

export function LeadDrawerTimelineTab({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return <p className="text-xs text-zinc-500">Todavía no hay actividad registrada para este lead.</p>
  }
  return (
    <ol className="flex flex-col gap-3 border-l border-zinc-800 pl-4">
      {activities.map((activity) => (
        <li key={activity.id} className="relative">
          <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-white" aria-hidden="true" />
          <strong className="block text-xs text-white">{activity.summary}</strong>
          <span className="text-[10px] font-mono text-zinc-500">
            {activity.type} ·{' '}
            {new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(activity.occurredAt))}
          </span>
        </li>
      ))}
    </ol>
  )
}
