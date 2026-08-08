import type { Metadata } from 'next/types'
import { PostsGridPage } from '@/components/PostsGridPage'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

export const revalidate = 600

type Args = { params: Promise<{ slug: string }> }

async function findCategory(slug: string) {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'categories',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })
  return result.docs[0] ?? null
}

export default async function Page({ params: paramsPromise }: Args) {
  const { slug } = await paramsPromise
  const category = await findCategory(slug)
  if (!category) return notFound()

  return (
    <PostsGridPage
      basePath={`/categoria/${slug}`}
      page={1}
      title={category.title}
      where={{ categories: { contains: category.id } }}
    />
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { slug } = await paramsPromise
  const category = await findCategory(slug)
  return { title: category ? `${category.title} | Blog de Viagem` : 'Categoria não encontrada' }
}

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const categories = await payload.find({
    collection: 'categories',
    limit: 1000,
    overrideAccess: true,
    pagination: false,
    select: { slug: true },
  })
  return categories.docs.map(({ slug }) => ({ slug }))
}
