/**
 * loading.tsx — fallback compartido para `/workspace` y todas sus rutas
 * anidadas (crm, tasks, hoy, inbox, social, billing, analytics) mientras
 * el Server Component de la página resuelve sus queries. Next.js envuelve
 * automáticamente cada `page.tsx` de este segmento (y los anidados, salvo
 * que definan su propio `loading.tsx` más específico) en un límite
 * Suspense con este fallback.
 */

import { Skeleton } from '@/components/workspace/ui'

export default function WorkspaceLoading() {
  return (
    <>
      <span className="sr-only" role="status">
        Cargando…
      </span>
      <section className="border border-zinc-800 bg-zinc-950 p-5 shadow-2xl" aria-hidden="true">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div className="w-full max-w-sm space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <article key={index} className="border border-zinc-800 bg-zinc-950 p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-7 w-16" />
            <Skeleton className="mt-3 h-3 w-24" />
          </article>
        ))}
      </section>

      <section className="border border-zinc-800 bg-zinc-950 p-4" aria-hidden="true">
        <Skeleton className="h-3 w-32" />
        <div className="mt-4 space-y-2.5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      </section>
    </>
  )
}
