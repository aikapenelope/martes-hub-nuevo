import type { CollectionConfig } from 'payload'

import { adminOnly } from '../access'

/**
 * Credencial del proyecto Composio del tenant — UNA fila por tenant
 * (ubicación autoritativa de la key; rotar = actualizar esta fila).
 * El estado por toolkit vive en `tenant-connections`. La key va cifrada
 * AES-GCM (`src/lib/crypto.ts`) y nunca se expone en la UI.
 */
export const TenantIntegrations: CollectionConfig = {
  slug: 'tenant-integrations',
  labels: {
    singular: 'Integración del Tenant',
    plural: 'Integraciones de Tenants',
  },
  admin: {
    useAsTitle: 'provider',
    group: 'Configuración',
    description:
      'Credenciales de integraciones del tenant (Composio BYO-key). La API key se guarda cifrada.',
  },
  access: {
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  timestamps: true,
  fields: [
    {
      name: 'provider',
      type: 'select',
      required: true,
      defaultValue: 'composio',
      label: 'Proveedor',
      options: [{ label: 'Composio', value: 'composio' }],
    },
    {
      name: 'apiKeyCifrado',
      type: 'text',
      required: true,
      label: 'API key (cifrada)',
      admin: {
        description: 'AES-256-GCM con INTEGRATIONS_ENC_KEY. Nunca se muestra en claro.',
      },
    },
    {
      name: 'estado',
      type: 'select',
      required: true,
      defaultValue: 'ok',
      label: 'Estado',
      options: [
        { label: 'OK', value: 'ok' },
        { label: 'Inválida', value: 'invalida' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
  ],
}
