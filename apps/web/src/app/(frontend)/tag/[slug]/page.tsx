import type { Metadata } from 'next/types'
import { PostsGridPage } from '@/components/PostsGridPage'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

export const revalidate = 600

type Args = { params: Promise<{ slug: string }> }

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
  const { slug } = await paramsPromise
  const tag = await findTag(slug)
  if (!tag) return notFound()

  return (
    <PostsGridPage
      basePath={`/tag/${slug}`}
      page={1}
      title={tag.title}
      where={{ tags: { contains: tag.id } }}
    />
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { slug } = await paramsPromise
  const tag = await findTag(slug)
  return { title: tag ? `${tag.title} | Blog de Viagem` : 'Tag não encontrada' }
}

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const tags = await payload.find({
    collection: 'tags',
    limit: 1000,
    overrideAccess: true,
    pagination: false,
    select: { slug: true },
  })
  return tags.docs.map(({ slug }) => ({ slug }))
}
