import type { Access } from 'payload'

export const isAdminEditorOrOwnPost: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'editor') return true

  // contributor: só os posts onde ele é o autor (campo authors -> users)
  return {
    authors: {
      contains: user.id,
    },
  }
}
