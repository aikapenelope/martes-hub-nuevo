import type { CollectionConfig } from 'payload'

import { adminOnly } from '../access'
import { encryptSecret } from '../lib/crypto'

/**
 * Credencial del proyecto Composio del tenant — UNA fila por tenant
 * (ubicación autoritativa de la key; rotar = actualizar esta fila).
 * El estado por toolkit vive en `tenant-connections`.
 *
 * **Asignación por el operador**: el campo `apiKey` es write-only y el hook
 * `beforeValidate` lo cifra en `apiKeyCifrado` — así el superadmin puede
 * crear/rotar la key de CUALQUIER tenant desde el panel `/admin` sin ver el
 * workspace de ese tenant (y el tenant puede hacerlo desde Ajustes).
 * `apiKeyCifrado` nunca vuelve a leerse en claro fuera de
 * `src/integrations/composio/client.ts`.
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
      'API key del proyecto Composio del tenant (cifrada). El superadmin la asigna desde /admin; el estado por servicio vive en Conexiones del Tenant.',
  },
  access: {
    read: adminOnly,
    create: adminOnly,
    update: adminOnly,
    delete: adminOnly,
  },
  hooks: {
    beforeValidate: [
      ({ data, operation }) => {
        if (!data) return data
        const plain = data.apiKey
        if (typeof plain === 'string' && plain.trim()) {
          data.apiKeyCifrado = encryptSecret(plain.trim())
        }
        delete data.apiKey
        if (operation === 'create' && !data.apiKeyCifrado) {
          throw new Error('apiKey es obligatoria al crear la integración')
        }
        return data
      },
    ],
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
      name: 'apiKey',
      type: 'text',
      label: 'API key (se cifra al guardar)',
      admin: {
        description:
          'Write-only: pegar la key del proyecto Composio del tenant. Al guardar se cifra y no vuelve a mostrarse.',
      },
    },
    {
      name: 'apiKeyCifrado',
      type: 'text',
      required: true,
      label: 'API key (cifrada)',
      hidden: true,
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
