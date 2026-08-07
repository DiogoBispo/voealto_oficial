import type { PayloadHandler } from 'payload'

export const getPostsByAtlasLocation: PayloadHandler = async (req) => {
  const slug = req.routeParams?.slug
  if (typeof slug !== 'string') {
    return Response.json({ error: 'Slug inválido' }, { status: 400 })
  }

  const location = await req.payload.find({
    collection: 'atlas-locations',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })

  if (!location.docs[0]) {
    return Response.json({ error: 'Localização não encontrada' }, { status: 404 })
  }

  const page = Number(req.query?.page) || 1
  const limit = Number(req.query?.limit) || 12

  const posts = await req.payload.find({
    collection: 'posts',
    where: {
      locations: { contains: location.docs[0].id },
      _status: { equals: 'published' },
      publishedAt: { less_than_equal: new Date().toISOString() },
    },
    page,
    limit,
    overrideAccess: false,
    req,
  })

  return Response.json(posts)
}
