'use client'
import { cn } from '@/utilities/ui'
import useClickableCard from '@/utilities/useClickableCard'
import Link from 'next/link'
import React, { Fragment } from 'react'

import type { Post } from '@/payload-types'

import { Media } from '@/components/Media'

// DECISION: author/publishedAt como Partial, não Pick direto — o plano (Task 1) pede
// `Pick<Post, ... | 'author' | 'publishedAt'>`, mas `Post.author` é obrigatório em `Post`,
// então isso tornaria `CardPostData.author` obrigatório e quebraria toda chamada existente de
// `CollectionArchive`/`Card` cujo `payload.find` não seleciona esses campos (ex.: /posts,
// /search) — arquivos fora do escopo desta task. Author/publishedAt são exibidos de forma
// condicional no JSX abaixo, então mantê-los opcionais preserva o comportamento atual sem
// forçar mudanças em arquivos que a Task 1 não lista.
export type CardPostData = Pick<Post, 'slug' | 'categories' | 'meta' | 'title'> &
  Partial<Pick<Post, 'author' | 'publishedAt'>>

export const Card: React.FC<{
  alignItems?: 'center'
  className?: string
  doc?: CardPostData
  relationTo?: 'posts'
  showCategories?: boolean
  title?: string
}> = (props) => {
  const { card, link } = useClickableCard({})
  const { className, doc, relationTo, showCategories, title: titleFromProps } = props

  const { slug, categories, meta, title, author, publishedAt } = doc || {}
  const { description, image: metaImage } = meta || {}

  const hasCategories = categories && Array.isArray(categories) && categories.length > 0
  const titleToUse = titleFromProps || title
  const sanitizedDescription = description?.replace(/\s/g, ' ') // replace non-breaking space with white space
  const href = `/${relationTo}/${slug}`

  const authorName =
    typeof author === 'object' && author !== null ? author.title : undefined
  const formattedDate = publishedAt
    ? new Date(publishedAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : undefined

  return (
    <article
      className={cn(
        'border border-border rounded-lg overflow-hidden bg-card hover:cursor-pointer',
        className,
      )}
      ref={card.ref}
    >
      <div className="relative w-full ">
        {!metaImage && <div className="">No image</div>}
        {metaImage && typeof metaImage !== 'string' && (
          <Media
            resource={metaImage}
            size="33vw"
            alt={(typeof metaImage === 'object' && metaImage.alt) || titleToUse || ''}
          />
        )}
      </div>
      <div className="p-4">
        {showCategories && hasCategories && (
          <div className="uppercase text-sm mb-4">
            {categories?.map((category, index) => {
              if (typeof category === 'object') {
                const { title: titleFromCategory } = category

                const categoryTitle = titleFromCategory || 'Untitled category'

                const isLast = index === categories.length - 1

                return (
                  <Fragment key={index}>
                    {categoryTitle}
                    {!isLast && <Fragment>, &nbsp;</Fragment>}
                  </Fragment>
                )
              }

              return null
            })}
          </div>
        )}
        {titleToUse && (
          <div className="prose">
            <h3>
              <Link className="not-prose" href={href} ref={link.ref}>
                {titleToUse}
              </Link>
            </h3>
          </div>
        )}
        {(authorName || formattedDate) && (
          <div className="text-sm text-muted-foreground mt-1">
            {authorName}
            {authorName && formattedDate && ' · '}
            {formattedDate}
          </div>
        )}
        {description && <div className="mt-2">{description && <p>{sanitizedDescription}</p>}</div>}
      </div>
    </article>
  )
}
