import type { GlobalConfig } from 'payload'

import { authenticated, adminOnly } from '../access'

export const CompanySettings: GlobalConfig = {
  slug: 'company-settings',
  label: 'Configuración de la empresa',
  access: {
    read: authenticated,
    update: adminOnly,
  },
  fields: [
    {
      name: 'companyName',
      type: 'text',
      required: true,
      label: 'Nombre de la empresa',
    },
    {
      name: 'timezone',
      type: 'text',
      required: true,
      defaultValue: 'America/Caracas',
      label: 'Zona horaria',
      admin: {
        description: 'Aplica a crons, calendario editorial y digestios (UTC-4)',
      },
    },
    {
      name: 'currency',
      type: 'select',
      required: true,
      defaultValue: 'USD',
      label: 'Moneda',
      options: ['USD'],
    },
    {
      name: 'digestHour',
      type: 'number',
      required: true,
      defaultValue: 8,
      label: 'Hora del digest diario (local)',
      min: 0,
      max: 23,
    },
    {
      name: 'internalNotificationsEmail',
      type: 'email',
      label: 'Email de notificaciones internas',
    },
  ],
}
