# Módulo 1 — Modelagem de Conteúdo (Collections) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** todas as collections do SPEC 1.1 existem no admin do Payload com validação de obrigatórios; um editor consegue criar um post completo (imagem, categoria, tag, autor, Atlas) sem tocar no banco diretamente.

**Architecture:** o template "website" já scaffolded no Módulo 0 traz `Posts`, `Categories`, `Pages`, `Media`, `Users` prontos e com bastante funcionalidade além do mínimo do SPEC (SEO plugin, redirects, drafts+agendamento nativo, nested-docs, busca). Este módulo **estende** essas collections e **cria** as que faltam (`Tags`, `AtlasLocations`, `Authors`, `AffiliateLinks`, `NewsletterSubscribers`), em vez de recriar tudo do zero — DRY, reaproveitando o que já funciona.

**Tech Stack:** Payload 3 (`CollectionConfig`), `slugField()` (helper nativo do Payload, já usado em `Categories`/`Posts`/`Pages`), Postgres via `@payloadcms/db-postgres`.

## Global Constraints

- Docker Compose já está rodando (`postgres` healthy, `web` em `next dev`) — as mudanças em `apps/web/src/collections/*` são hot-reloadadas pelo volume montado; Payload roda migração automática do schema Postgres ao reiniciar/detectar mudança de config em dev (`push: true` é o padrão do adapter em dev). Não precisa `docker compose restart` a não ser que o hot-reload falhe.
- Nomenclatura: o template já usa `title` (não `name`) como label do campo principal em `Categories`/`Posts`/`Pages`, e usa `slugField()` do próprio Payload em vez de implementar hook de slug manual. **Seguir o padrão existente** nas collections novas (`Tags.title`, `AtlasLocations.title`) em vez do texto literal do SPEC (`name`) — consistência com o código já commitado pesa mais que a nomenclatura do documento de spec.
- `git init`/identidade já configurados; commits seguem o padrão dos commits do Módulo 0.

## Decisões desta revisão (divergências do texto literal do SPEC, documentadas)

1. **Status draft/scheduled/published:** o SPEC pede um campo `status: select`. `Posts` e `Pages` **já têm** o sistema nativo de drafts + `schedulePublish: true` do Payload (campo interno `_status`, botão "Publish"/"Save draft" no admin, agendamento de publicação futura). Não vou adicionar um campo `status` manual redundante — o sistema nativo já entrega exatamente o comportamento pedido (rascunho/agendado/publicado) e é o que o Módulo 2 (RBAC) vai travar via `access control`, mais robusto que checar o valor de um select customizado.
2. **`author` (SPEC) vs `authors` (template):** o template já tem um campo `authors` (relationship hasMany → `users`, a collection de login) com hook `populateAuthors` pra expor nome sem vazar dados de login. O SPEC pede uma collection **separada** `authors` (nome, bio, avatar, redes sociais) — um perfil público de autor, diferente da conta de login. São conceitos diferentes (login vs perfil editorial público), então crio a nova collection `Authors` e um novo campo singular `author` (relationship → `authors`, required) nos Posts, **sem mexer** no `authors`/`populatedAuthors` existente (fora de escopo, não quebrar o que já funciona).
3. **`coverImage`/`body` (SPEC) vs `heroImage`/`content` (template):** mantenho os nomes já existentes no template (`heroImage`, `content`) em vez de renomear — evita quebrar hooks (`revalidatePost`, `populateAuthors`, SEO plugin) que já referenciam esses nomes.

---

### Task 1: Collections de taxonomia — `Tags` e `AtlasLocations`

**Files:**
- Create: `apps/web/src/collections/Tags.ts`
- Create: `apps/web/src/collections/AtlasLocations.ts`
- Modify: `apps/web/src/payload.config.ts` (registrar as duas nas `collections: []`)

**Interfaces:**
- Produces: `relationTo: 'tags'` e `relationTo: 'atlas-locations'` disponíveis pra Task 4 usar em `Posts`.

- [ ] **Step 1:** Criar `apps/web/src/collections/Tags.ts`, espelhando exatamente o padrão de `Categories.ts` (mesmo `access`, mesmo uso de `slugField()`):
```typescript
import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { slugField } from 'payload'

export const Tags: CollectionConfig = {
  slug: 'tags',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    slugField({
      position: undefined,
    }),
  ],
}
```
- [ ] **Step 2:** Criar `apps/web/src/collections/AtlasLocations.ts` — taxonomia geográfica continente > país > cidade via relationship pra si mesma:
```typescript
import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { slugField } from 'payload'

export const AtlasLocations: CollectionConfig = {
  slug: 'atlas-locations',
  labels: {
    singular: 'Atlas Location',
    plural: 'Atlas Locations',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'type', 'parent'],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Continente', value: 'continent' },
        { label: 'País', value: 'country' },
        { label: 'Cidade', value: 'city' },
      ],
    },
    {
      name: 'parent',
      type: 'relationship',
      relationTo: 'atlas-locations',
      admin: {
        description: 'Ex.: uma cidade tem como parent o país; um país tem como parent o continente.',
      },
      filterOptions: ({ id }) => {
        return {
          id: {
            not_equals: id,
          },
        }
      },
    },
    slugField({
      position: undefined,
    }),
  ],
}
```
- [ ] **Step 3:** Registrar em `apps/web/src/payload.config.ts`: adicionar `import { Tags } from './collections/Tags'` e `import { AtlasLocations } from './collections/AtlasLocations'`, incluir ambas no array `collections: [Pages, Posts, Media, Categories, Tags, AtlasLocations, Users]`.
- [ ] **Step 4:** Rodar `npm run generate:types -w apps/web` pra atualizar `payload-types.ts` com os novos tipos `Tag` e `AtlasLocation`.
- [ ] **Step 5:** Commit: `git add apps/web/src/collections/Tags.ts apps/web/src/collections/AtlasLocations.ts apps/web/src/payload.config.ts apps/web/src/payload-types.ts && git commit -m "feat: add Tags and AtlasLocations collections"`

---

### Task 2: Collection `Authors` (perfil público de autor)

**Files:**
- Create: `apps/web/src/collections/Authors.ts`
- Modify: `apps/web/src/payload.config.ts`

**Interfaces:**
- Consumes: `relationTo: 'media'` (avatar).
- Produces: `relationTo: 'authors'` disponível pra Task 4 usar em `Posts.author`.

- [ ] **Step 1:** Criar `apps/web/src/collections/Authors.ts`:
```typescript
import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { slugField } from 'payload'

export const Authors: CollectionConfig = {
  slug: 'authors',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'updatedAt'],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Nome',
    },
    {
      name: 'bio',
      type: 'textarea',
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'socials',
      type: 'array',
      fields: [
        {
          name: 'platform',
          type: 'select',
          required: true,
          options: [
            { label: 'Instagram', value: 'instagram' },
            { label: 'TikTok', value: 'tiktok' },
            { label: 'YouTube', value: 'youtube' },
            { label: 'Facebook', value: 'facebook' },
            { label: 'Pinterest', value: 'pinterest' },
            { label: 'Site pessoal', value: 'website' },
          ],
        },
        {
          name: 'url',
          type: 'text',
          required: true,
        },
      ],
    },
    slugField({
      position: undefined,
    }),
  ],
}
```
- [ ] **Step 2:** Registrar em `payload.config.ts`: `import { Authors } from './collections/Authors'`, incluir no array `collections`.
- [ ] **Step 3:** Rodar `npm run generate:types -w apps/web`.
- [ ] **Step 4:** Commit: `git add apps/web/src/collections/Authors.ts apps/web/src/payload.config.ts apps/web/src/payload-types.ts && git commit -m "feat: add Authors collection (public author profile)"`

---

### Task 3: Collections planas — `AffiliateLinks` e `NewsletterSubscribers`

**Files:**
- Create: `apps/web/src/collections/AffiliateLinks.ts`
- Create: `apps/web/src/collections/NewsletterSubscribers.ts`
- Modify: `apps/web/src/payload.config.ts`

**Interfaces:**
- Produces: `relationTo: 'affiliate-links'` e `relationTo: 'newsletter-subscribers'` (usados nos Módulos 4 e 7, não neste módulo).

- [ ] **Step 1:** Criar `apps/web/src/collections/AffiliateLinks.ts`:
```typescript
import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'

export const AffiliateLinks: CollectionConfig = {
  slug: 'affiliate-links',
  labels: {
    singular: 'Affiliate Link',
    plural: 'Affiliate Links',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'active', 'order'],
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
    },
    {
      name: 'url',
      type: 'text',
      required: true,
    },
    {
      name: 'icon',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
    },
  ],
}
```
- [ ] **Step 2:** Criar `apps/web/src/collections/NewsletterSubscribers.ts`:
```typescript
import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'

export const NewsletterSubscribers: CollectionConfig = {
  slug: 'newsletter-subscribers',
  labels: {
    singular: 'Newsletter Subscriber',
    plural: 'Newsletter Subscribers',
  },
  access: {
    // DECISION: ninguém lê/edita pelo admin público além de usuários autenticados;
    // a escrita pública real acontece via endpoint custom no Módulo 3/7 (com sua
    // própria validação/rate-limit), não diretamente pela API REST da collection.
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'source', 'subscribedAt'],
  },
  fields: [
    {
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
    },
    {
      name: 'subscribedAt',
      type: 'date',
      defaultValue: () => new Date().toISOString(),
    },
    {
      name: 'source',
      type: 'text',
    },
  ],
}
```
- [ ] **Step 3:** Registrar ambas em `payload.config.ts` e rodar `npm run generate:types -w apps/web`.
- [ ] **Step 4:** Commit: `git add apps/web/src/collections/AffiliateLinks.ts apps/web/src/collections/NewsletterSubscribers.ts apps/web/src/payload.config.ts apps/web/src/payload-types.ts && git commit -m "feat: add AffiliateLinks and NewsletterSubscribers collections"`

---

### Task 4: Estender `Posts` e `Categories`

**Files:**
- Modify: `apps/web/src/collections/Posts/index.ts`
- Modify: `apps/web/src/collections/Categories.ts`

**Interfaces:**
- Consumes: `relationTo: 'tags'`, `relationTo: 'atlas-locations'`, `relationTo: 'authors'` (Tasks 1–2).

- [ ] **Step 1:** Em `Categories.ts`, adicionar campo `description` (SPEC 1.1) logo após `title`:
```typescript
{
  name: 'description',
  type: 'textarea',
},
```
- [ ] **Step 2:** Em `Posts/index.ts`, na tab "Meta" (onde já vive `categories`), adicionar `tags`, `locations` e `author`:
```typescript
{
  name: 'tags',
  type: 'relationship',
  admin: {
    position: 'sidebar',
  },
  hasMany: true,
  relationTo: 'tags',
},
{
  name: 'locations',
  type: 'relationship',
  admin: {
    position: 'sidebar',
  },
  hasMany: true,
  relationTo: 'atlas-locations',
},
{
  name: 'author',
  type: 'relationship',
  required: true,
  admin: {
    position: 'sidebar',
  },
  relationTo: 'authors',
},
```
(inserir logo depois do bloco `categories` já existente na tab "Meta", mesma indentação/posição no array.)
- [ ] **Step 3:** Ainda em `Posts/index.ts`, adicionar campo `excerpt` (SPEC 1.1, max 300 caracteres) e `sponsored` na tab "Content", antes ou depois de `content`:
```typescript
{
  name: 'excerpt',
  type: 'textarea',
  maxLength: 300,
  admin: {
    description: 'Resumo curto usado nos cards de listagem (máx. 300 caracteres).',
  },
},
```
```typescript
{
  name: 'sponsored',
  type: 'checkbox',
  defaultValue: false,
  admin: {
    position: 'sidebar',
    description: 'Marca o post como conteúdo patrocinado — exibe badge "Conteúdo patrocinado" no front (Módulo 5).',
  },
},
```
- [ ] **Step 4:** Rodar `npm run generate:types -w apps/web` e conferir que `Post`, `Category` em `payload-types.ts` têm os novos campos tipados.
- [ ] **Step 5:** Commit: `git add apps/web/src/collections/Posts/index.ts apps/web/src/collections/Categories.ts apps/web/src/payload-types.ts && git commit -m "feat: extend Posts (excerpt, tags, locations, author, sponsored) and Categories (description)"`

---

### Task 5: Typecheck, build e verificação end-to-end no admin

**Files:** nenhum novo — só verificação.

- [ ] **Step 1:** Rodar `npm run build -w apps/web` (Postgres real já está rodando via `docker compose`, então desta vez o build tem que passar de ponta a ponta, diferente do Módulo 0).
- [ ] **Step 2:** Se o `next dev` do container não hot-reload o schema do Postgres automaticamente, rodar `docker compose restart web`.
- [ ] **Step 3:** Verificação manual no admin (`http://localhost:3000/admin`), cobrindo a Definição de Pronto do SPEC 1.3:
  - Criar 1 registro em cada collection nova (`Tags`, `Atlas Locations` — 1 continente + 1 país com `parent`, `Authors`, `Affiliate Links`).
  - Criar 1 Post completo usando: `heroImage` (upload), `excerpt`, `content`, 1 categoria, 1 tag, 1 Atlas location, 1 author, `sponsored` marcado.
  - Confirmar que campos obrigatórios (`title`, `content`, `author`) bloqueiam salvar quando vazios.
  - Confirmar que o slug é gerado automaticamente a partir do título e é editável.
- [ ] **Step 4:** Reportar o resultado da verificação manual (o que funcionou, o que não).

## Definição de Pronto (Módulo 1)

- [ ] Todas as collections do SPEC 1.1 existem no admin com validação de obrigatórios (`Posts`, `Categories`, `Tags`, `AtlasLocations`, `Authors`, `Media`, `Pages`, `AffiliateLinks`, `NewsletterSubscribers`).
- [ ] Slug gerado automaticamente e editável, com unicidade garantida pelo `slugField()` nativo.
- [ ] Hierarquia `atlas-locations.parent → self` permite montar continente > país > cidade.
- [ ] Upload de imagem gera múltiplos tamanhos (já satisfeito pelo `Media.ts` existente — 7 tamanhos, muito além do mínimo de 2 do SPEC).
- [ ] Um post completo é criado via admin sem tocar no banco diretamente.
