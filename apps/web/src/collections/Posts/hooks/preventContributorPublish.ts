import type { CollectionBeforeChangeHook } from 'payload'

// DECISION: reforço server-side da regra "contributor não publica" (SPEC Módulo 2).
// Reverte silenciosamente pra draft em vez de lançar erro — o contributor
// continua conseguindo salvar o post, só não com status published.
export const preventContributorPublish: CollectionBeforeChangeHook = ({ data, req }) => {
  if (req.user?.role === 'contributor' && data._status === 'published') {
    return { ...data, _status: 'draft' }
  }
  return data
}
