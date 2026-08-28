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
import { publishScheduledPostsTask } from './jobs/publishScheduledPosts'
import { fetchSocialMetricsTask } from './jobs/fetchSocialMetrics'
import { refreshSocialTokensTask } from './jobs/refreshSocialTokens'
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
    components: {
      views: {
        dashboardHermes: {
          path: '/dashboard',
          exact: true,
          Component: '/views/Dashboard#DashboardView',
        },
        inbox: {
          path: '/inbox',
          exact: true,
          Component: '/views/Inbox#InboxView',
        },
        hoy: {
          path: '/hoy',
          exact: true,
          Component: '/views/Hoy#HoyView',
        },
      },
      afterNavLinks: ['/components/DashboardNavLink#DashboardNavLink'],
    },
  },
  collections: [
    Tenants,
    Users,
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
        'social-accounts': {},
        'social-posts': {},
        'post-metrics': {},
        'company-settings': { isGlobal: true },
      },
    }),
    mcpPlugin({
      collections: {
        clients: {
          description: 'Clientes del CRM: datos de contacto, etapa, notas y estado.',
          enabled: true,
        },
        leads: {
          description: 'Prospectos (leads) en pipeline: estado, rubro, canal y notas.',
          enabled: true,
        },
        tasks: {
          description: 'Gestión de tareas internas: título, estado, prioridad y asignaciones.',
          enabled: true,
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
          description: 'Resúmenes ejecutivos con sentimiento, objeciones y próximos pasos de clientes.',
          enabled: {
            delete: false,
            find: true,
            create: false,
            update: false,
          },
        },
        'social-posts': {
          description: 'Publicaciones en redes sociales: contenido, fecha programada y estado.',
          enabled: {
            delete: false,
            find: true,
            create: false,
            update: false,
          },
        },
        'post-metrics': {
          description: 'Métricas de rendimiento de publicaciones sociales: alcance, likes, impresiones.',
          enabled: {
            delete: false,
            find: true,
            create: false,
            update: false,
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
      publishScheduledPostsTask,
      fetchSocialMetricsTask,
      refreshSocialTokensTask,
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
    if (!secret && process.env.VERCEL) {
      throw new Error('FATAL: PAYLOAD_SECRET environment variable is required on Vercel deployments.')
    }
    return secret || 'martes-hub-build-secret-key-32chars-min'
  })(),
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
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
