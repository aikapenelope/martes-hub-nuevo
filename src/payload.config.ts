import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
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
import { openbspWebhookHandler } from './endpoints/openbspWebhook'
import { replyConversationHandler } from './endpoints/replyConversation'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const emailAdapter = process.env.RESEND_API_KEY
  ? nodemailerAdapter({
      defaultFromAddress: process.env.RESEND_FROM || 'onboarding@resend.dev',
      defaultFromName: 'Martes Hub',
      transportOptions: {
        host: process.env.RESEND_SMTP_HOST || 'smtp.resend.com',
        port: Number(process.env.RESEND_SMTP_PORT || 465),
        secure: true,
        auth: {
          user: 'resend',
          pass: process.env.RESEND_API_KEY,
        },
      },
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
    CompanySettings,
  ],
  plugins: [
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
