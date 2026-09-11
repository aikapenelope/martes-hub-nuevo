/**
 * MessageTemplatesPage — `/workspace/templates`. Plantillas de WhatsApp
 * (Meta/OpenBSP), sincronizadas a diario por el job `sync-templates`.
 * Antes solo se podían ver/registrar desde `/admin`.
 */

import { MessageSquareText } from 'lucide-react'

import { getWorkspaceContext } from '@/lib/workspace-context'
import { MessageTemplateCreateDialog } from '@/components/workspace/MessageTemplateCreateDialog'
import { PageHeader } from '@/components/workspace/page-header'
import { Badge } from '@/components/ui/badge'
import type { MessageTemplate } from '@/payload-types'

const dateFmt = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric' })

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline'> = {
  APPROVED: 'success',
  PENDING: 'warning',
  REJECTED: 'destructive',
  DISABLED: 'destructive',
  PAUSED: 'outline',
}

export default async function MessageTemplatesPage() {
  const context = await getWorkspaceContext()
  const { payload, user, tenantId, canEdit } = context

  const templatesRes = await payload.find({
    collection: 'message-templates',
    where: { tenant: { equals: tenantId } },
    depth: 0,
    limit: 100,
    sort: 'name',
    overrideAccess: false,
    user,
  })
  const templates = templatesRes.docs as MessageTemplate[]

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`Plantillas WhatsApp · ${context.tenant.name}`}
        title="Plantillas de Mensajería"
        description="Sincronizadas a diario desde Meta vía OpenBSP. El estado de aprobación (metaStatus) solo lo actualiza el sync."
        actions={canEdit ? <MessageTemplateCreateDialog /> : undefined}
      />

      <div className="bg-card text-card-foreground border border-border p-3.5 !p-0">
        {templates.length === 0 ? (
          <div className="py-10 text-center font-mono text-xs text-muted-foreground">Sin plantillas sincronizadas todavía. Se sincronizan automáticamente todos los días a las 12:30.</div>
        ) : (
          <div className="flex flex-col">
            {templates.map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-3 border-b border-border p-4 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <MessageSquareText className="w-3.5 h-3.5 text-muted-foreground" />
                    <strong className="text-sm text-foreground">{t.name}</strong>
                    <span className="text-[10px] text-muted-foreground font-mono uppercase">{t.language}</span>
                    {t.category && <span className="text-[10px] text-muted-foreground font-mono">· {t.category}</span>}
                  </div>
                  {t.bodyText && <p className="mt-1.5 text-xs text-muted-foreground">{t.bodyText}</p>}
                  <span className="mt-1.5 block text-[10px] text-muted-foreground font-mono">
                    Actualizada {dateFmt.format(new Date(t.updatedAt))}
                    {t.openbspTemplateId && ` · ID OpenBSP: ${t.openbspTemplateId}`}
                  </span>
                </div>
                <Badge variant={t.metaStatus ? STATUS_VARIANT[t.metaStatus] ?? 'outline' : 'outline'} className="font-mono text-[10px]">
                  {t.metaStatus ?? 'sin sync'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
