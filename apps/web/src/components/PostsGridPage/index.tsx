import { CollectionArchive } from '@/components/CollectionArchive'
import { PageRange } from '@/components/PageRange'
import { Pagination } from '@/components/Pagination'
import configPromise from '@payload-config'
import { getPayload } from 'payload'
import type { Where } from 'payload'
import React from 'react'

export const PostsGridPage: React.FC<{
  basePath: string
  limit?: number
  page: number
  title?: string
  where?: Where
}> = async ({ basePath, limit = 12, page, title, where }) => {
  const payload = await getPayload({ config: configPromise })

  const posts = await payload.find({
    collection: 'posts',
    depth: 1,
    page,
    limit,
    overrideAccess: false,
    where: {
      ...where,
      publishedAt: { less_than_equal: new Date().toISOString() },
    },
    select: {
      title: true,
      slug: true,
      categories: true,
      author: true,
      publishedAt: true,
      meta: true,
    },
  })

  return (
    <div className="pt-24 pb-24">
      {title && (
        <div className="container mb-16">
          <div className="prose dark:prose-invert max-w-none">
            <h1>{title}</h1>
          </div>
        </div>
      )}

      <div className="container mb-8">
        <PageRange collection="posts" currentPage={posts.page} limit={limit} totalDocs={posts.totalDocs} />
      </div>

      <CollectionArchive posts={posts.docs} />

      <div className="container">
        {posts.totalPages > 1 && posts.page && (
          <Pagination basePath={basePath} page={posts.page} totalPages={posts.totalPages} />
        )}
      </div>
    </div>
  )
}
