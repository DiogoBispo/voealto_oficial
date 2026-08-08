import type { Metadata } from 'next/types'

import { PostsGridPage } from '@/components/PostsGridPage'
import React from 'react'
import PageClient from './page.client'

export const dynamic = 'force-static'
export const revalidate = 600

export default function Page() {
  return (
    <>
      <PageClient />
      <PostsGridPage basePath="/posts" page={1} title="Posts" />
    </>
  )
}

export function generateMetadata(): Metadata {
  return {
    title: `Payload Website Template Posts`,
  }
}
