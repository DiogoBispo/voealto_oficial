import type { CollectionBeforeChangeHook } from 'payload'

// DECISION: garante que quem cria o post já nasce dono dele (campo `authors`,
// usado por `isAdminEditorOrOwnPost` pra decidir posse). Sem isso, um
// contributor ficaria sem conseguir editar o próprio post logo após criá-lo.
export const setPostAuthorOnCreate: CollectionBeforeChangeHook = ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create' || !req.user) return data

  const currentAuthors = Array.isArray(data.authors) ? data.authors : []
  if (currentAuthors.includes(req.user.id)) return data

  return { ...data, authors: [...currentAuthors, req.user.id] }
}
