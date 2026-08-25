import type { CollectionConfig } from 'payload'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  access: {
    read: ({ req }) => Boolean(req.user),
  },
  fields: [
    // Email added by default
    // Add more fields as needed
  ],
  versions: false,
}
