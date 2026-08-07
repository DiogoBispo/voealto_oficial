import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { isAdmin } from '../../access/isAdmin'
import { isAdminOrSelf } from '../../access/isAdminOrSelf'
import { setFirstUserAsAdmin } from './hooks/setFirstUserAsAdmin'

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    create: isAdmin,
    delete: isAdmin,
    read: isAdminOrSelf,
    update: isAdminOrSelf,
  },
  admin: {
    defaultColumns: ['name', 'email', 'role'],
    useAsTitle: 'name',
  },
  auth: true,
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'contributor',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Contributor', value: 'contributor' },
      ],
      access: {
        // DECISION: só admin muda role de alguém — inclusive a própria (evita
        // um contributor se auto-promover editando o próprio usuário).
        // A checagem é inlined (em vez de chamar `isAdmin`) porque o access
        // de campo (`FieldAccess`) exige retorno estritamente `boolean`,
        // enquanto `isAdmin` é tipado como `Access` (retorno `boolean | Where`)
        // — chamá-lo aqui não compila (Where não é atribuível a boolean).
        update: ({ req }) => Boolean(req.user && req.user.role === 'admin'),
      },
    },
  ],
  hooks: {
    beforeChange: [setFirstUserAsAdmin],
  },
  timestamps: true,
}
