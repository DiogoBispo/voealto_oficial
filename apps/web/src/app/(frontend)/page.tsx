import type { Metadata } from 'next/types'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { CollectionArchive } from '@/components/CollectionArchive'
import { AffiliateLinksStrip } from '@/components/AffiliateLinksStrip'
import { NewsletterForm } from '@/components/NewsletterForm'
import { PostsGridPage } from '@/components/PostsGridPage'

export const revalidate = 60

const postSelect = {
  title: true,
  slug: true,
  categories: true,
  author: true,
  publishedAt: true,
  meta: true,
} as const

export default async function HomePage() {
  const payload = await getPayload({ config: configPromise })

  const publishedFilter = {
    publishedAt: { less_than_equal: new Date().toISOString() },
  }

  const featured = await payload.find({
    collection: 'posts',
    depth: 1,
    limit: 4,
    overrideAccess: false,
    where: publishedFilter,
    sort: '-publishedAt',
    select: postSelect,
  })

  const recent = await payload.find({
    collection: 'posts',
    depth: 1,
    limit: 4, // DECISION: mesmo `limit` do `featured` (4) — Payload pagina por
    page: 2, // offset = limit * (page-1), então page:2 só pula exatamente os
    overrideAccess: false, // 4 destaques se o limit bater. Usar limit:8 aqui
    where: publishedFilter, // com page:2 pularia 8 (offset errado), não 4 —
    sort: '-publishedAt', // bug pego na revisão do plano, antes de implementar.
    select: postSelect,
  })

  return (
    <div className="pt-24 pb-24">
      <div className="container mb-16">
        <div className="prose dark:prose-invert max-w-none">
          <h1>Voe Alto Traveller</h1>
        </div>
      </div>

      <CollectionArchive posts={featured.docs} />

      <AffiliateLinksStrip />

      <div className="container mt-16 mb-8">
        <div className="prose dark:prose-invert max-w-none">
          <h2>Últimas publicações</h2>
        </div>
      </div>
      <CollectionArchive posts={recent.docs} />

      <NewsletterForm source="home" />

      <PostsGridPage basePath="/posts" page={1} />
    </div>
  )
}

export function generateMetadata(): Metadata {
  return { title: 'Voe Alto Traveller — Blog de Viagem' }
}
