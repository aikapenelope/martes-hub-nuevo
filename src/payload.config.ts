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
import { invoicePdf, builtInTemplates } from 'payload-invoicepdf'
import { openbspWebhookHandler } from './endpoints/openbspWebhook'
import { replyConversationHandler } from './endpoints/replyConversation'
import { followupsHoyHandler } from './endpoints/followupsHoy'
import { resendWebhookHandler } from './endpoints/resendWebhook'

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
        'company-settings': { isGlobal: true },
      },
    }),
  ],
  email: emailAdapter,
  jobs: {
    tasks: [paymentRemindersTask, dailyDigestTask, syncTemplatesTask, openbspErrorsTask],
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
  ],
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL || '',
    },
    push: false,
    migrationDir: './src/migrations',
  }),
  sharp,
  i18n: {
    fallbackLanguage: 'es',
  },
})
