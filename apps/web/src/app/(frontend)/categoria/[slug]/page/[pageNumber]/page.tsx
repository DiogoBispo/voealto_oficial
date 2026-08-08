import type { Metadata } from 'next/types'
import { PostsGridPage } from '@/components/PostsGridPage'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

export const revalidate = 600

type Args = { params: Promise<{ slug: string; pageNumber: string }> }

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
  const { slug, pageNumber } = await paramsPromise
  const sanitizedPageNumber = Number(pageNumber)
  if (!Number.isInteger(sanitizedPageNumber)) notFound()

  const category = await findCategory(slug)
  if (!category) return notFound()

  return (
    <PostsGridPage
      basePath={`/categoria/${slug}`}
      page={sanitizedPageNumber}
      title={category.title}
      where={{ categories: { contains: category.id } }}
    />
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { slug, pageNumber } = await paramsPromise
  const category = await findCategory(slug)
  return {
    title: category
      ? `${category.title} | Blog de Viagem | Página ${pageNumber}`
      : 'Categoria não encontrada',
  }
}

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const categories = await payload.find({
    collection: 'categories',
    limit: 1000,
    overrideAccess: true,
    pagination: false,
  })

  const params: { slug: string; pageNumber: string }[] = []

  for (const category of categories.docs) {
    const { totalDocs } = await payload.count({
      collection: 'posts',
      overrideAccess: false,
      where: {
        categories: { contains: category.id },
        publishedAt: { less_than_equal: new Date().toISOString() },
      },
    })
    const totalPages = Math.ceil(totalDocs / 12)
    // DECISION: página 1 já é servida por /categoria/[slug] — gerar estaticamente
    // só a partir da página 2 evita duplicar a mesma rota em dois caminhos.
    for (let i = 2; i <= totalPages; i++) {
      params.push({ slug: category.slug, pageNumber: String(i) })
    }
  }

  return params
}
