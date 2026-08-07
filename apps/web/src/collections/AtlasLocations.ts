import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { isAdminOrEditor } from '../access/isAdminOrEditor'
import { slugField } from 'payload'

export const AtlasLocations: CollectionConfig = {
  slug: 'atlas-locations',
  labels: {
    singular: 'Atlas Location',
    plural: 'Atlas Locations',
  },
  access: {
    create: isAdminOrEditor,
    delete: isAdminOrEditor,
    read: anyone,
    update: isAdminOrEditor,
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
        // DECISION: ao criar um documento novo, `id` vem `undefined` — qualquer filtro
        // Where que compare a coluna `id` contra `undefined`/`null` (seja `not_equals`
        // ou `not_in`) vira uma comparação `<> NULL` no Postgres, que nunca é verdadeira
        // pra nenhuma linha, e bloqueia QUALQUER seleção de parent (bug encontrado ao
        // rodar a verificação do Módulo 1). Sem `id` ainda, não há nada a excluir —
        // `true` desativa o filtro (API do Payload aceita boolean em filterOptions).
        if (!id) return true
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
