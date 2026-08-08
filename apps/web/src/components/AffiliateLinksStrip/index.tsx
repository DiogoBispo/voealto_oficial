import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'

export const AffiliateLinksStrip: React.FC = async () => {
  const payload = await getPayload({ config: configPromise })
  const { docs: links } = await payload.find({
    collection: 'affiliate-links',
    where: { active: { equals: true } },
    sort: 'order',
    overrideAccess: true,
    limit: 100,
  })

  if (links.length === 0) return null

  return (
    <div className="container my-8">
      <div className="flex flex-wrap gap-4 justify-center border-y border-border py-4">
        {links.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="text-sm uppercase tracking-wide hover:underline"
          >
            {link.label}
          </a>
        ))}
      </div>
    </div>
  )
}
