import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { slugField } from 'payload'

export const AtlasLocations: CollectionConfig = {
  slug: 'atlas-locations',
  labels: {
    singular: 'Atlas Location',
    plural: 'Atlas Locations',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'parent'],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Continente', value: 'continent' },
        { label: 'País', value: 'country' },
        { label: 'Cidade', value: 'city' },
      ],
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'atlas-locations',
      admin: {
        description: 'Ex.: uma cidade tem como parent o país; um país tem como parent o continente.',
      },
      filterOptions: ({ id }) => {
        return {
          id: {
            not_equals: id,
          },
        }
      },
    },
    slugField({
      position: undefined,
    }),
  ],
}
