import type { Post } from '@/payload-types'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { RelatedPosts } from '@/blocks/RelatedPosts/Component'

export const RelatedPostsByCategory: React.FC<{ post: Post }> = async ({ post }) => {
  const categoryIds = (post.categories ?? [])
    .map((c) => (typeof c === 'object' ? c.id : c))
    .filter(Boolean)

  if (categoryIds.length === 0) return null

  const payload = await getPayload({ config: configPromise })
  const related = await payload.find({
    collection: 'posts',
    depth: 1,
    limit: 3,
    overrideAccess: false,
    where: {
      categories: { in: categoryIds },
      id: { not_equals: post.id },
      publishedAt: { less_than_equal: new Date().toISOString() },
    },
  })

  if (related.docs.length === 0) return null

  return (
    <RelatedPosts
      className="mt-12 max-w-[52rem] lg:grid lg:grid-cols-subgrid col-start-1 col-span-3 grid-rows-[2fr]"
      docs={related.docs}
    />
  )
}
