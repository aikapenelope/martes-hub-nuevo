import { postgresAdapter } from '@payloadcms/db-postgres'
import { resendAdapter } from '@payloadcms/email-resend'
import { importExportPlugin } from '@payloadcms/plugin-import-export'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { payloadKanbanBoard } from 'payload-kanban-board'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Companies } from './collections/Companies'
import { Clients } from './collections/Clients'
import { Leads } from './collections/Leads'
import { Activities } from './collections/Activities'
import { Segments } from './collections/Segments'
import { Documents } from './collections/Documents'
import { Tenants } from './collections/Tenants'
import { CompanySettings } from './collections/CompanySettings'
import { Payments } from './collections/Payments'
import { Memberships } from './collections/Memberships'
import { Conversations } from './collections/Conversations'
import { Messages } from './collections/Messages'
import { MessageTemplates } from './collections/MessageTemplates'
import { importCsvHandler } from './endpoints/importCsv'
import { exportCsvHandler } from './endpoints/exportCsv'
import { workspaceSearchHandler } from './endpoints/workspaceSearch'
import { paymentRemindersTask } from './jobs/paymentReminders'
import { dailyDigestTask } from './jobs/dailyDigest'
import { syncTemplatesTask } from './jobs/syncTemplates'
import { openbspErrorsTask } from './jobs/openbspErrorLog'
import { Notifications } from './collections/Notifications'
import { EmailLog } from './collections/EmailLog'
import { EmailCampaigns } from './collections/EmailCampaigns'
import { Offers } from './collections/Offers'
import { FormSubmissions } from './collections/FormSubmissions'
import { Tasks } from './collections/Tasks'
import { ConversationSummaries } from './collections/ConversationSummaries'
import { ConversationNotes } from './collections/ConversationNotes'
import { SocialAccounts } from './collections/SocialAccounts'
import { SocialPosts } from './collections/SocialPosts'
import { PostMetrics } from './collections/PostMetrics'
import { invoicePdf, builtInTemplates } from 'payload-invoicepdf'
import { s3Storage } from '@payloadcms/storage-s3'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { openbspWebhookHandler } from './endpoints/openbspWebhook'
import { replyConversationHandler } from './endpoints/replyConversation'
import { followupsHoyHandler } from './endpoints/followupsHoy'
import { resendWebhookHandler } from './endpoints/resendWebhook'
import { tallyWebhookHandler } from './endpoints/tallyWebhook'
import { dashboardStatsHandler } from './endpoints/dashboardStats'
import { sendCampaignTask } from './jobs/sendCampaignTask'
import { sendScheduledCampaignsTask } from './jobs/sendScheduledCampaigns'
import type { User } from './payload-types'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const emailAdapter = process.env.RESEND_API_KEY
  ? resendAdapter({
      defaultFromAddress: process.env.RESEND_FROM || 'onboarding@resend.dev',
      defaultFromName: 'Martes Hub',
      apiKey: process.env.RESEND_API_KEY,
    })
  : undefined

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Tenants,
    Users,
    Companies,
    Clients,
    Leads,
    Activities,
    Segments,
    Documents,
    Media,
    Payments,
    Memberships,
    Conversations,
    Messages,
    MessageTemplates,
    Notifications,
    EmailLog,
    EmailCampaigns,
    Offers,
    FormSubmissions,
    Tasks,
    ConversationSummaries,
    ConversationNotes,
    SocialAccounts,
    SocialPosts,
    PostMetrics,
    CompanySettings,
  ],
  plugins: [
    importExportPlugin({
      collections: [{ slug: 'leads' }, { slug: 'clients' }, { slug: 'payments' }],
    }),
    payloadKanbanBoard({
      collections: {
        leads: {
          enabled: true,
          config: {
            statuses: [
              { value: 'nuevo', label: 'Nuevo' },
              { value: 'contactado', label: 'Contactado' },
              { value: 'calificado', label: 'Calificado' },
              { value: 'descartado', label: 'Descartado' },
            ],
            defaultStatus: 'nuevo',
          },
        },
        tasks: {
          enabled: true,
          config: {
            statuses: [
              { value: 'pendiente', label: 'Pendiente' },
              { value: 'en_progreso', label: 'En Progreso' },
              { value: 'completada', label: 'Completada' },
              { value: 'bloqueada', label: 'Bloqueada' },
              { value: 'cancelada', label: 'Cancelada' },
            ],
            defaultStatus: 'pendiente',
          },
        },
      },
    }),
    invoicePdf({
      productCollection: 'offers',
      productFieldMapping: {
        name: 'name',
        price: 'price',
        description: 'description',
      },
      templates: [...builtInTemplates],
      customerCollection: 'clients',
      customerFieldMapping: {
        name: 'name',
        email: 'email',
      },
      mediaCollection: 'media',
      currency: '$',
      defaultTaxRate: 0.16,
      defaultPaymentTerms: 30,
      invoiceNumberPrefix: 'INV',
      quoteNumberPrefix: 'COT',
    }),
    multiTenantPlugin({
      userHasAccessToAllTenants: (user) => Boolean((user as User)?.roles?.includes('admin')),
      collections: {
        companies: {},
        clients: {},
        leads: {},
        activities: {},
        segments: {},
        documents: {},
        media: {},
        payments: {},
        memberships: {},
        conversations: {},
        messages: {},
        'message-templates': {},
        notifications: {},
        'email-log': {},
        'email-campaigns': {},
        offers: {},
        invoices: {},
        quotes: {},
        'form-submissions': {},
        tasks: {},
        'conversation-summaries': {},
        'conversation-notes': {},
        'social-accounts': {},
        'social-posts': {},
        'post-metrics': {},
        'company-settings': { isGlobal: true },
      },
    }),
    mcpPlugin({
      collections: {
        // find/create/update abiertos: el agente MCP necesita poder registrar
        // leads/clientes nuevos y actualizar su estado como parte de su
        // trabajo normal. delete:false porque no hay ningún flujo legítimo
        // en el que un agente externo deba borrar un registro de negocio —
        // mismo criterio de riesgo que ya se aplicó a payments/invoices/quotes
        // y a conversation-summaries/social-posts/post-metrics/media más abajo.
        // Ver payloadcms.com/docs/plugins/mcp: cada operación adicional es más
        // superficie de mutación no intencionada.
        clients: {
          description: 'Clientes del CRM: datos de contacto, etapa, notas y estado.',
          enabled: { find: true, create: true, update: true, delete: false },
        },
        leads: {
          description: 'Prospectos (leads) en pipeline: estado, rubro, canal y notas.',
          enabled: { find: true, create: true, update: true, delete: false },
        },
        tasks: {
          description: 'Gestión de tareas internas: título, estado, prioridad y asignaciones.',
          enabled: { find: true, create: true, update: true, delete: false },
        },
        // Documentos financieros: SOLO LECTURA para el agente MCP.
        // Sin create/update el agente no puede sintetizar ni mutar cobros/facturas/cotizaciones.
        payments: {
          description:
            'Registro de pagos y cobros de clientes. SOLO LECTURA: el agente no crea ni modifica pagos.',
          enabled: {
            delete: false,
            find: true,
            create: false,
            update: false,
          },
        },
        invoices: {
          description: 'Facturas emitidas. SOLO LECTURA para el agente.',
          enabled: {
            delete: false,
            find: true,
            create: false,
            update: false,
          },
        },
        quotes: {
          description: 'Cotizaciones enviadas y en negociación. SOLO LECTURA para el agente.',
          enabled: {
            delete: false,
            find: true,
            create: false,
            update: false,
          },
        },
        'conversation-summaries': {
          description:
            'Resúmenes ejecutivos con sentimiento, objeciones y próximos pasos de clientes. El agente puede crear/actualizar resúmenes (p. ej. tras analizar una conversación), no puede borrarlos.',
          enabled: {
            delete: false,
            find: true,
            create: true,
            update: true,
          },
        },
        media: {
          description:
            'Imágenes y videos subidos (incluidos los adjuntos de publicaciones sociales). El agente puede subir/consultar archivos; no puede sobrescribir ni borrar los existentes.',
          enabled: {
            delete: false,
            find: true,
            create: true,
            update: false,
          },
        },
        'social-accounts': {
          description:
            'Cuentas de redes sociales conectadas en Metricool/Composio (referencia, no credenciales). SOLO LECTURA: la cuenta se administra en /admin, el agente solo la consulta para saber a qué cuenta publicar.',
          enabled: {
            delete: false,
            find: true,
            create: false,
            update: false,
          },
        },
        companies: {
          description:
            'Empresas/cuentas del CRM. SOLO LECTURA: la estructura de cuentas se mantiene desde /admin; el agente solo la consulta para saber a qué empresa pertenece un contacto.',
          enabled: {
            delete: false,
            find: true,
            create: false,
            update: false,
          },
        },
        'social-posts': {
          description:
            'Publicaciones en redes sociales: copy, imágenes adjuntas, cuenta destino, estado (borrador/programado/publicado/fallido) y calendario. El agente crea/programa el contenido aquí; la publicación real la hace conectado además al MCP de Metricool o Composio, y marca el resultado (publicado/fallido, enlace público) de vuelta en este mismo documento.',
          enabled: {
            delete: false,
            find: true,
            create: true,
            update: true,
          },
        },
        'post-metrics': {
          description:
            'Métricas de rendimiento de publicaciones sociales: alcance, likes, impresiones, comentarios. El agente las escribe aquí tras consultarlas en Metricool/Composio.',
          enabled: {
            delete: false,
            find: true,
            create: true,
            update: true,
          },
        },
        users: {
          description: 'Usuarios del sistema.',
          enabled: {
            create: false,
            delete: false,
            update: false,
            find: true,
          },
        },
      },
    }),
    ...(process.env.S3_BUCKET
      ? [
          s3Storage({
            collections: {
              media: true,
              documents: true,
            },
            bucket: process.env.S3_BUCKET,
            config: {
              credentials: {
                accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
                secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
              },
              region: process.env.S3_REGION || 'auto',
              endpoint: process.env.S3_ENDPOINT,
              forcePathStyle: true,
            },
          }),
        ]
      : []),
  ],
  email: emailAdapter,
  jobs: {
    tasks: [
      paymentRemindersTask,
      dailyDigestTask,
      syncTemplatesTask,
      openbspErrorsTask,
      sendCampaignTask,
      sendScheduledCampaignsTask,
    ],
  },
  editor: lexicalEditor(),
  endpoints: [
    {
      path: '/import-csv',
      method: 'post',
      handler: importCsvHandler,
    },
    {
      path: '/export-csv',
      method: 'get',
      handler: exportCsvHandler,
    },
    {
      path: '/workspace-search',
      method: 'get',
      handler: workspaceSearchHandler,
    },
    {
      path: '/webhooks/openbsp',
      method: 'post',
      handler: openbspWebhookHandler,
    },
    {
      path: '/messaging/reply',
      method: 'post',
      handler: replyConversationHandler,
    },
    {
      path: '/followups/hoy',
      method: 'get',
      handler: followupsHoyHandler,
    },
    {
      path: '/webhooks/resend',
      method: 'post',
      handler: resendWebhookHandler,
    },
    {
      path: '/webhooks/tally',
      method: 'post',
      handler: tallyWebhookHandler,
    },
    {
      path: '/dashboard/stats',
      method: 'get',
      handler: dashboardStatsHandler,
    },
  ],
  secret: (() => {
    const secret = process.env.PAYLOAD_SECRET
    if (!secret && (process.env.VERCEL || process.env.NODE_ENV === 'production')) {
      throw new Error('FATAL: PAYLOAD_SECRET environment variable is required in production.')
    }
    return secret || 'martes-hub-build-secret-key-32chars-min'
  })(),
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
      max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : process.env.VERCEL ? 3 : 6,
      // No cerrar por idle: mantiene las conexiones warm (keepAlive) y evita
      // el churn que, con el transaction pooler de Neon y su autosuspend,
      // producía `read ETIMEDOUT` a los pocos minutos de inactividad.
      idleTimeoutMillis: 0,
      connectionTimeoutMillis: 20000,
      // Watchdogs client-side (pg >= 8.11): nunca dejar una query colgada.
      query_timeout: 12000,
      statement_timeout: 15000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 5000,
      ...(process.env.SUPABASE_CA_CERT || process.env.DATABASE_CA_CERT
        ? {
            ssl: {
              rejectUnauthorized: true,
              ca: (process.env.SUPABASE_CA_CERT || process.env.DATABASE_CA_CERT || '').replace(/\\n/g, '\n'),
            },
          }
        : {}),
    },
    push: false,
    migrationDir: './src/migrations',
  }),
  sharp,
  i18n: {
    fallbackLanguage: 'es',
  },
})
