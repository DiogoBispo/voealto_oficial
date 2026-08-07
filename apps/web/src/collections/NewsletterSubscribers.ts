import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'

export const NewsletterSubscribers: CollectionConfig = {
  slug: 'newsletter-subscribers',
  labels: {
    singular: 'Newsletter Subscriber',
    plural: 'Newsletter Subscribers',
  },
  access: {
    // DECISION: ninguém lê/edita pelo admin público além de usuários autenticados;
    // a escrita pública real acontece via endpoint custom no Módulo 3/7 (com sua
    // própria validação/rate-limit), não diretamente pela API REST da collection.
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
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
