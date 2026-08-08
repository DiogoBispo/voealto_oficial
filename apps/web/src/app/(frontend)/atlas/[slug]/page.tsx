import type { Metadata } from 'next/types'
import { PostsGridPage } from '@/components/PostsGridPage'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { notFound } from 'next/navigation'

export const revalidate = 600

type Args = { params: Promise<{ slug: string }> }

async function findAtlasLocation(slug: string) {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'atlas-locations',
    where: { slug: { equals: slug } },
    limit: 1,
    overrideAccess: true,
  })
  return result.docs[0] ?? null
}

export default async function Page({ params: paramsPromise }: Args) {
  const { slug } = await paramsPromise
  const atlasLocation = await findAtlasLocation(slug)
  if (!atlasLocation) return notFound()

  return (
    <PostsGridPage
      basePath={`/atlas/${slug}`}
      page={1}
      title={atlasLocation.title}
      where={{ locations: { contains: atlasLocation.id } }}
    />
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { slug } = await paramsPromise
  const atlasLocation = await findAtlasLocation(slug)
  return { title: atlasLocation ? `${atlasLocation.title} | Blog de Viagem` : 'Atlas não encontrado' }
}

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const atlasLocations = await payload.find({
    collection: 'atlas-locations',
    limit: 1000,
    overrideAccess: true,
    pagination: false,
    select: { slug: true },
  })
  return atlasLocations.docs.map(({ slug }) => ({ slug }))
}
