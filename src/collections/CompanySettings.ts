import type { CollectionConfig } from 'payload'

import { adminOnly, authenticated } from '../access'

export const CompanySettings: CollectionConfig = {
  slug: 'company-settings',
  labels: {
    singular: 'Configuración de la empresa',
    plural: 'Configuraciones de empresas',
  },
  admin: {
    group: 'Administración',
  },
  access: {
    read: authenticated,
    update: adminOnly,
    create: adminOnly,
    delete: adminOnly,
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
      options: [{ label: 'USD ($)', value: 'USD' }],
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
    {
      name: 'aiProvider',
      type: 'select',
      defaultValue: 'groq',
      label: 'Proveedor de IA (Worker Ligero)',
      options: [
        { label: 'Groq (Recomendado - Llama 3.3)', value: 'groq' },
        { label: 'OpenRouter (Multi-modelo)', value: 'openrouter' },
        { label: 'Personalizado (OpenAI compatible)', value: 'custom' },
      ],
      admin: {
        description: 'Motor de inferencia para resúmenes de chat y análisis en segundo plano',
      },
    },
    {
      name: 'aiApiKey',
      type: 'text',
      label: 'API Key de IA',
      admin: {
        description: 'Clave de Groq u OpenRouter. Si se deja vacía, se usará la variable de entorno GROQ_API_KEY / OPENROUTER_API_KEY.',
      },
    },
    {
      name: 'aiModel',
      type: 'text',
      defaultValue: 'llama-3.3-70b-versatile',
      label: 'Modelo de IA',
      admin: {
        description: 'Ej: llama-3.3-70b-versatile (Groq), meta-llama/llama-3.3-70b-instruct (OpenRouter)',
      },
    },
    {
      name: 'aiAutoSummarize',
      type: 'checkbox',
      defaultValue: true,
      label: 'Resumen automático de chats',
      admin: {
        description: 'Analizar automáticamente las conversaciones de WhatsApp cuando se detecte inactividad tras una ráfaga de mensajes',
      },
    },
    {
      name: 'paymentMethods',
      type: 'group',
      label: 'Cuentas y Métodos de Pago',
      admin: {
        description: 'Se insertan automáticamente en cotizaciones, facturas y mensajes de cobranza por WhatsApp.',
      },
      fields: [
        {
          name: 'pagoMovil',
          type: 'group',
          label: 'Pago Móvil (Venezuela)',
          fields: [
            { name: 'banco', type: 'text', label: 'Banco (Ej: Banco de Venezuela)', maxLength: 100 },
            { name: 'cedula', type: 'text', label: 'Cédula / RIF (Ej: V-12345678)', maxLength: 20 },
            { name: 'telefono', type: 'text', label: 'Teléfono Titular (Ej: 0412-1234567)', maxLength: 20 },
          ],
        },
        {
          name: 'transferenciaVes',
          type: 'group',
          label: 'Transferencia Bancaria (Bs)',
          fields: [
            { name: 'banco', type: 'text', label: 'Banco', maxLength: 100 },
            { name: 'numeroCuenta', type: 'text', label: 'Número de cuenta (20 dígitos)', maxLength: 25 },
            { name: 'titular', type: 'text', label: 'Titular de la cuenta', maxLength: 200 },
            { name: 'rif', type: 'text', label: 'RIF del titular', maxLength: 20 },
          ],
        },
        {
          name: 'zelle',
          type: 'group',
          label: 'Zelle (USD)',
          fields: [
            { name: 'email', type: 'email', label: 'Correo electrónico de Zelle' },
            { name: 'titular', type: 'text', label: 'Nombre del titular registrado en Zelle', maxLength: 200 },
          ],
        },
        {
          name: 'binance',
          type: 'group',
          label: 'Binance Pay / Cripto (USDT)',
          fields: [
            { name: 'binanceId', type: 'text', label: 'Binance ID o Email', maxLength: 200 },
            { name: 'walletUsdt', type: 'text', label: 'Dirección USDT TRC20 (opcional)', maxLength: 100 },
          ],
        },
        {
          name: 'swift',
          type: 'group',
          label: 'Transferencia Internacional (SWIFT/USD)',
          fields: [
            { name: 'banco', type: 'text', label: 'Banco receptor', maxLength: 200 },
            { name: 'swift', type: 'text', label: 'Código SWIFT/BIC', maxLength: 20 },
            { name: 'accountNumber', type: 'text', label: 'Número de cuenta / IBAN', maxLength: 100 },
            { name: 'titular', type: 'text', label: 'Nombre del titular', maxLength: 200 },
          ],
        },
      ],
    },
  ],
}

