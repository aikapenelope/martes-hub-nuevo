import type { TaskConfig } from 'payload'
import { generateLeadBrief } from '@/lib/lead-brief'

/**
 * Brief 360 del lead generado por IA (Vercel AI SDK, modelo del tenant).
 * Se encola desde updateLeadFieldsAction cuando el lead sube a "caliente"
 * y desde la ficha on demand. Upsert del más reciente en `lead-briefs`.
 */
export const generateLeadBriefTask: TaskConfig = {
  slug: 'generate-lead-brief',
  label: 'Brief IA del lead',
  retries: 1,
  inputSchema: [
    { name: 'leadId', type: 'number', required: true },
    { name: 'tenantId', type: 'number', required: true },
  ],
  outputSchema: [
    { name: 'briefId', type: 'number' },
  ],
  handler: async ({ req, input }) => {
    const rawInput = (input ?? {}) as Record<string, unknown>
    const brief = await generateLeadBrief({
      payload: req.payload,
      tenantId: Number(rawInput.tenantId),
      leadId: Number(rawInput.leadId),
    })
    return { output: { briefId: brief.id } }
  },
}
