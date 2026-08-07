import type { PayloadHandler } from 'payload'

export const getPostBySlug: PayloadHandler = async (req) => {
  const slug = req.routeParams?.slug
  if (typeof slug !== 'string') {
    return Response.json({ error: 'Slug inválido' }, { status: 400 })
  }

  const result = await req.payload.find({
    collection: 'posts',
    where: {
      slug: { equals: slug },
      _status: { equals: 'published' },
      publishedAt: { less_than_equal: new Date().toISOString() },
    },
    limit: 1,
    overrideAccess: false,
    req,
  })

  const doc = result.docs[0]
  if (!doc) {
    return Response.json({ error: 'Post não encontrado' }, { status: 404 })
  }

  return Response.json(doc)
}
