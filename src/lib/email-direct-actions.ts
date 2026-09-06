'use server'

import { revalidatePath } from 'next/cache'
import { getWorkspaceContext } from '@/lib/workspace-context'

export async function sendDirectEmailAction(formData: FormData) {
  const context = await getWorkspaceContext()
  
  const recipientRaw = String(formData.get('recipientId'))
  const subject = String(formData.get('subject'))
  const body = String(formData.get('body'))
  
  if (!recipientRaw || !subject || !body) {
    throw new Error('Faltan campos requeridos')
  }

  // En un sistema real esto enviaría el email vía Resend/AWS SES y guardaría el log
  // Aquí podríamos registrarlo como Activity en Payload
  
  console.log(`[EMAIL 1:1] Tenant: ${context.tenant.id} | To: ${recipientRaw} | Subject: ${subject}`)
  
  // Registrar actividad (opcional)
  try {
    const isLead = recipientRaw.startsWith('lead_')
    const id = Number(recipientRaw.split('_')[1])
    
    await context.payload.create({
      collection: 'activities',
      data: {
        tenant: context.tenantId,
        type: 'email',
        summary: `Email 1:1 enviado: ${subject}\n${body.slice(0, 100)}`,
        lead: isLead ? id : undefined,
        client: !isLead ? id : undefined,
        occurredAt: new Date().toISOString(),
        performedBy: context.user.id
      },
      overrideAccess: true
    })
  } catch (error) {
    console.error('No se pudo registrar la actividad del email:', error)
  }

  revalidatePath('/workspace/email')
  revalidatePath('/workspace/crm')
  revalidatePath('/workspace/activities')
}
