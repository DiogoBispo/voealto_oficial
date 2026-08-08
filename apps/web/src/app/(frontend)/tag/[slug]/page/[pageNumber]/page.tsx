import type { Metadata } from 'next/types'
import { PostsGridPage } from '@/components/PostsGridPage'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

export const revalidate = 600

type Args = { params: Promise<{ slug: string; pageNumber: string }> }

async function findTag(slug: string) {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'tags',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })
  return result.docs[0] ?? null
}

export default async function Page({ params: paramsPromise }: Args) {
  const { slug, pageNumber } = await paramsPromise
  const sanitizedPageNumber = Number(pageNumber)
  if (!Number.isInteger(sanitizedPageNumber)) notFound()

  const tag = await findTag(slug)
  if (!tag) return notFound()

  return (
    <PostsGridPage
      basePath={`/tag/${slug}`}
      page={sanitizedPageNumber}
      title={tag.title}
      where={{ tags: { contains: tag.id } }}
    />
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { slug, pageNumber } = await paramsPromise
  const tag = await findTag(slug)
  return {
    title: tag ? `${tag.title} | Blog de Viagem | Página ${pageNumber}` : 'Tag não encontrada',
  }
}

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const tags = await payload.find({
    collection: 'tags',
    limit: 1000,
    overrideAccess: true,
    pagination: false,
  })

  const params: { slug: string; pageNumber: string }[] = []

  for (const tag of tags.docs) {
    const { totalDocs } = await payload.count({
      collection: 'posts',
      overrideAccess: false,
      where: {
        tags: { contains: tag.id },
        publishedAt: { less_than_equal: new Date().toISOString() },
      },
    })
    const totalPages = Math.ceil(totalDocs / 12)
    // DECISION: página 1 já é servida por /tag/[slug] — gerar estaticamente
    // só a partir da página 2 evita duplicar a mesma rota em dois caminhos.
    for (let i = 2; i <= totalPages; i++) {
      params.push({ slug: tag.slug, pageNumber: String(i) })
    }
  }

  return params
}
