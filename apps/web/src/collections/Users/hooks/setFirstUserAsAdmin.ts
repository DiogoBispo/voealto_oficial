import type { CollectionBeforeChangeHook } from 'payload'

// DECISION: sem isso, ninguém consegue virar admin depois que o campo `role`
// existir — o primeiro usuário do sistema (tela nativa "criar primeiro usuário"
// do Payload, que ignora access.create) precisa nascer admin.
export const setFirstUserAsAdmin: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') return data

  const existingUsers = await req.payload.count({
    collection: 'users',
    req,
  })

  if (existingUsers.totalDocs === 0) {
    return { ...data, role: 'admin' }
  }

  return data
}
