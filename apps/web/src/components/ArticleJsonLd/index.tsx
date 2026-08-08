import type { Post } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'

export const ArticleJsonLd: React.FC<{ post: Post }> = ({ post }) => {
  const serverUrl = getServerSideURL()
  const authorName =
    typeof post.author === 'object' && post.author !== null ? post.author.title : undefined
  const imageUrl =
    typeof post.heroImage === 'object' && post.heroImage !== null && post.heroImage.url
      ? serverUrl + post.heroImage.url
      : undefined

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.meta?.description || post.excerpt || undefined,
    image: imageUrl ? [imageUrl] : undefined,
    datePublished: post.publishedAt || undefined,
    dateModified: post.updatedAt || undefined,
    author: authorName ? { '@type': 'Person', name: authorName } : undefined,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${serverUrl}/posts/${post.slug}`,
    },
  }

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  )
}
