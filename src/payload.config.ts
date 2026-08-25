import { postgresAdapter } from '@payloadcms/db-postgres'
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

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

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
    Clients,
    Leads,
    Activities,
    Segments,
    Documents,
    Media,
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
        'company-settings': { isGlobal: true },
      },
    }),
  ],
  editor: lexicalEditor(),
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
