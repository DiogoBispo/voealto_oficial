import type { Metadata } from 'next'

import type { Media, Page, Post, Config } from '../payload-types'

import { mergeOpenGraph } from './mergeOpenGraph'
import { getServerSideURL } from './getURL'

const getImageURL = (
  image?: Media | Config['db']['defaultIDType'] | null,
  fallback?: Media | Config['db']['defaultIDType'] | null,
) => {
  const serverUrl = getServerSideURL()
  const resolved = image ?? fallback

  let url = serverUrl + '/website-template-OG.webp'

  if (resolved && typeof resolved === 'object' && 'url' in resolved) {
    const ogUrl = resolved.sizes?.og?.url
    url = ogUrl ? serverUrl + ogUrl : serverUrl + resolved.url
  }

  return url
}

export const generateMeta = async (args: {
  doc: (Partial<Page> | Partial<Post>) | null
}): Promise<Metadata> => {
  const { doc } = args

  const heroImage = doc && 'heroImage' in doc ? doc.heroImage : undefined
  const excerpt = doc && 'excerpt' in doc ? doc.excerpt : undefined

  const ogImage = getImageURL(doc?.meta?.image, heroImage)

  const resolvedTitle = doc?.meta?.title || doc?.title
  const title = resolvedTitle ? `${resolvedTitle} | Voe Alto Traveller` : 'Voe Alto Traveller — Blog de Viagem'
  const description = doc?.meta?.description || excerpt || undefined

  return {
    description,
    openGraph: mergeOpenGraph({
      description: description || '',
      images: ogImage ? [{ url: ogImage }] : undefined,
      title,
      url: Array.isArray(doc?.slug) ? doc?.slug.join('/') : '/',
    }),
    title,
  }
}
