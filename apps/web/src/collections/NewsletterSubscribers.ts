import type { CollectionConfig } from 'payload'

import { isAdminOrEditor } from '../access/isAdminOrEditor'

export const NewsletterSubscribers: CollectionConfig = {
  slug: 'newsletter-subscribers',
  labels: {
    singular: 'Newsletter Subscriber',
    plural: 'Newsletter Subscribers',
  },
  access: {
    // DECISION: restrito a admin/editor — contributor não vê nem gerencia a lista
    // de inscritos (RBAC Módulo 2). A escrita pública real acontece via endpoint
    // custom no Módulo 3/7 (com sua própria validação/rate-limit), não diretamente
    // pela API REST da collection.
    create: isAdminOrEditor,
    delete: isAdminOrEditor,
    read: isAdminOrEditor,
    update: isAdminOrEditor,
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'source', 'subscribedAt'],
  },
  fields: [
    {
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
    },
    {
      name: 'subscribedAt',
      type: 'date',
      defaultValue: () => new Date().toISOString(),
    },
    {
      name: 'source',
      type: 'text',
    },
  ],
}
