'use server'

import { revalidatePath } from 'next/cache'

import { getWorkspaceContext } from '@/lib/workspace-context'

/**
 * Sube un documento (PDF) desde el workspace — antes esta colección no
 * tenía ninguna página en `/workspace`, solo era accesible desde `/admin`.
 * Usa el patrón de subida de archivos de la Local API de Payload
 * (`file: { data: Buffer, mimetype, name, size }`), documentado en
 * ADAPTERS.md/COLLECTIONS.md del skill oficial de Payload.
 */
export async function uploadDocumentAction(formData: FormData): Promise<void> {
  const context = await getWorkspaceContext()
  if (!context.canEdit) throw new Error('No tienes permiso para subir documentos')

  const clientId = Number(formData.get('client'))
  if (!Number.isInteger(clientId) || clientId <= 0) throw new Error('Selecciona un cliente')

  const clientCheck = await context.payload.find({
    collection: 'clients',
    limit: 1,
    depth: 0,
    overrideAccess: false,
    user: context.user,
    where: { and: [{ id: { equals: clientId } }, { tenant: { equals: context.tenantId } }] },
  })
  if (clientCheck.docs.length === 0) throw new Error('Cliente no encontrado en el tenant activo')

  const titleRaw = formData.get('title')
  const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim().slice(0, 160) : undefined

  const documentType = formData.get('documentType')
  const validType = typeof documentType === 'string' && ['contrato', 'factura', 'otro'].includes(documentType)
    ? (documentType as 'contrato' | 'factura' | 'otro')
    : 'contrato'

  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('Falta el archivo PDF')
  if (file.type !== 'application/pdf') throw new Error('Solo se aceptan archivos PDF')

  const buffer = Buffer.from(await file.arrayBuffer())

  await context.payload.create({
    collection: 'documents',
    overrideAccess: false,
    user: context.user,
    data: {
      title: title ?? file.name.replace(/\.pdf$/i, ''),
      client: clientId,
      documentType: validType,
    },
    file: {
      data: buffer,
      mimetype: file.type,
      name: file.name,
      size: file.size,
    },
  })

  revalidatePath('/workspace/documents')
}
