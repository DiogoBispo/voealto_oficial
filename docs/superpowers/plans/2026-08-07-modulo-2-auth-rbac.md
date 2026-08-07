# Módulo 2 — Autenticação e Permissões (RBAC) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** três papéis (`admin`, `editor`, `contributor`) com limites reais de acesso, testáveis com 3 contas — login funcional, contributor não consegue publicar nem mexer em conteúdo de terceiros, acesso negado retorna 403 (nunca 500).

**Architecture:** campo `role` na collection `users` (nativa do Payload) + funções de access control reutilizáveis em `apps/web/src/access/`, aplicadas a todas as 10 collections existentes. A restrição "contributor não publica" é reforçada num hook `beforeChange` em `Posts` (servidor, não contorna via API direta) — não numa customização de UI do admin (ver Decisão 3).

**Tech Stack:** Payload 3 `access` functions (`Access<T>`), `beforeChange` hooks, Postgres.

## Global Constraints

- Docker Compose rodando (`postgres` healthy, `web` em `next dev`). Banco está **vazio de usuários** (confirmado via `psql`) — o próprio Payload mostra a tela de "criar primeiro usuário" quando a collection `users` está vazia, ignorando `access.create` (comportamento nativo, não precisa tratar).
- Rodar `npm run build`/`generate:types`/scripts sempre via `docker compose exec web ...` (Postgres não é exposto ao host — ver README).
- Nenhuma role deve travar o próprio sistema (ver Decisão 1 — bootstrap do primeiro admin).

## Decisões desta revisão

1. **Bootstrap do primeiro usuário:** adiciono um hook `beforeChange` em `Users` que força `role = 'admin'` quando `data.role` não é explicitamente admin **e** a collection `users` está vazia (é o primeiro documento sendo criado). Sem isso, o campo `role` teria que ter um default e ninguém conseguiria promover a própria conta a admin depois (ninguém com permissão pra editar `role` existiria ainda).
2. **Escopo de acesso do `contributor`:** o SPEC só especifica "cria/edita posts próprios, não pode mudar status pra published". Sigo YAGNI: contributor ganha `create`/`update` em `Posts` (só os próprios) e `create` em `Media` (precisa subir imagem pro próprio post). Nas demais collections (`Categories`, `Tags`, `AtlasLocations`, `Authors`, `Pages`, `AffiliateLinks`, `NewsletterSubscribers`) contributor fica **read-only** (pode escolher categoria/tag existente num relationship, não pode criar/editar a taxonomia em si) — não pedido no SPEC, não implementado.
3. **"Contributor não vê opção de publicar" — reforço server-side, não customização de UI:** o SPEC pede que o botão de publicar suma da UI pro contributor. Implementar isso de verdade exigiria um componente de admin customizado do Payload (sobrescrever o botão Publish/Save Draft) — escopo grande, fora do MVP. O que implemento é o que **importa de verdade pra segurança**: um hook `beforeChange` em `Posts` que **reverte silenciosamente** `_status` pra `draft` sempre que quem está salvando é `contributor` e tentou setar `published` — isso vale tanto pra UI quanto pra chamada direta na API, o que uma customização de UI sozinha não garantiria (um contributor mal-intencionado podia só chamar a API direto). Documentado aqui como divergência consciente: a UI ainda mostra o botão, mas publicar via ele não tem efeito nenhum pra quem é contributor.
4. **403 vs 500:** `access` functions do Payload que retornam `false`/`Where` já resultam em 403 nativamente. O cuidado aqui é só não deixar nenhuma function de access ou hook lançar exceção não tratada (isso viraria 500).

---

### Task 1: Campo `role` em `Users` + bootstrap do primeiro admin

**Files:**
- Modify: `apps/web/src/collections/Users/index.ts`
- Create: `apps/web/src/collections/Users/hooks/setFirstUserAsAdmin.ts`

**Interfaces:**
- Produces: `User.role: 'admin' | 'editor' | 'contributor'`, disponível pra todas as access functions das próximas tasks (`req.user.role`).

- [ ] **Step 1:** Criar `apps/web/src/collections/Users/hooks/setFirstUserAsAdmin.ts`:
```typescript
import type { CollectionBeforeChangeHook } from 'payload'

// DECISION: sem isso, ninguém consegue virar admin depois que o campo `role`
// existir — o primeiro usuário do sistema (tela nativa "criar primeiro usuário"
// do Payload, que ignora access.create) precisa nascer admin.
export const setFirstUserAsAdmin: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') return data

  const existingUsers = await req.payload.count({
    collection: 'users',
    req,
  })

  if (existingUsers.totalDocs === 0) {
    return { ...data, role: 'admin' }
  }

  return data
}
```
- [ ] **Step 2:** Editar `apps/web/src/collections/Users/index.ts` — adicionar o campo `role` e o hook:
```typescript
import type { CollectionConfig } from 'payload'

import { authenticated } from '../../access/authenticated'
import { isAdmin } from '../../access/isAdmin'
import { isAdminOrSelf } from '../../access/isAdminOrSelf'
import { setFirstUserAsAdmin } from './hooks/setFirstUserAsAdmin'

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    create: isAdmin,
    delete: isAdmin,
    read: isAdminOrSelf,
    update: isAdminOrSelf,
  },
  admin: {
    defaultColumns: ['name', 'email', 'role'],
    useAsTitle: 'name',
  },
  auth: true,
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'contributor',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Contributor', value: 'contributor' },
      ],
      access: {
        // DECISION: só admin muda role de alguém — inclusive a própria (evita
        // um contributor se auto-promover editando o próprio usuário).
        update: ({ req }) => isAdmin({ req } as never),
      },
    },
  ],
  hooks: {
    beforeChange: [setFirstUserAsAdmin],
  },
  timestamps: true,
}
```
(`isAdmin`/`isAdminOrSelf` são criados na Task 2 — esta task assume que já existem; se rodar isolada, criar como stubs simples primeiro ou seguir a ordem das tasks.)
- [ ] **Step 3:** Rodar `docker compose exec web npm run generate:types` e conferir que `User` em `payload-types.ts` tem `role: 'admin' | 'editor' | 'contributor'`.
- [ ] **Step 4:** Commit: `git add apps/web/src/collections/Users && git commit -m "feat: add role field to Users with first-user-becomes-admin bootstrap"`

---

### Task 2: Funções de access control reutilizáveis

**Files:**
- Create: `apps/web/src/access/isAdmin.ts`
- Create: `apps/web/src/access/isAdminOrEditor.ts`
- Create: `apps/web/src/access/isAdminOrSelf.ts`
- Create: `apps/web/src/access/isAdminEditorOrOwnPost.ts`

**Interfaces:**
- Produces: funções `Access` (tipo do Payload) usadas nas Tasks 1, 3 e 4.

- [ ] **Step 1:** Criar `apps/web/src/access/isAdmin.ts`:
```typescript
import type { Access } from 'payload'

export const isAdmin: Access = ({ req: { user } }) => {
  return Boolean(user && user.role === 'admin')
}
```
- [ ] **Step 2:** Criar `apps/web/src/access/isAdminOrEditor.ts`:
```typescript
import type { Access } from 'payload'

export const isAdminOrEditor: Access = ({ req: { user } }) => {
  return Boolean(user && (user.role === 'admin' || user.role === 'editor'))
}
```
- [ ] **Step 3:** Criar `apps/web/src/access/isAdminOrSelf.ts` (usado em `Users` — admin vê todo mundo, qualquer um vê/edita só a própria conta):
```typescript
import type { Access } from 'payload'

export const isAdminOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.role === 'admin') return true

  return {
    id: {
      equals: user.id,
    },
  }
}
```
- [ ] **Step 4:** Criar `apps/web/src/access/isAdminEditorOrOwnPost.ts` (usado em `Posts` — admin/editor mexem em qualquer post, contributor só nos próprios):
```typescript
import type { Access } from 'payload'

export const isAdminEditorOrOwnPost: Access = ({ req: { user } }) => {
  if (!user) return false
  if (user.role === 'admin' || user.role === 'editor') return true

  // contributor: só os posts onde ele é o autor (campo authors -> users)
  return {
    authors: {
      contains: user.id,
    },
  }
}
```
- [ ] **Step 5:** Commit: `git add apps/web/src/access/isAdmin.ts apps/web/src/access/isAdminOrEditor.ts apps/web/src/access/isAdminOrSelf.ts apps/web/src/access/isAdminEditorOrOwnPost.ts && git commit -m "feat: add role-based access control helpers"`

---

### Task 3: Aplicar RBAC nas collections de conteúdo

**Files:**
- Modify: `apps/web/src/collections/Categories.ts`, `Tags.ts`, `AtlasLocations.ts`, `Authors.ts`, `Media.ts`, `Pages/index.ts`, `AffiliateLinks.ts`, `NewsletterSubscribers.ts`

**Interfaces:**
- Consumes: `isAdmin`, `isAdminOrEditor` (Task 2).

- [ ] **Step 1:** Em `Categories.ts`, `Tags.ts`, `AtlasLocations.ts`, `Authors.ts`, `AffiliateLinks.ts` (mesmo padrão nas 5): trocar `create`/`delete`/`update: authenticated` por `isAdminOrEditor`, manter `read: anyone`.
- [ ] **Step 2:** Em `Media.ts`: `create: isAdminOrEditor` vira **exceção** — contributor também precisa subir imagem (Decisão 2). Usar uma nova função inline `({ req: { user } }) => Boolean(user)` (equivalente ao `authenticated` já existente, é o comportamento correto aqui — reaproveitar o `authenticated` já importado, sem criar função nova) só pra `create`; `update`/`delete: isAdminOrEditor`; `read: anyone` (mantido).
- [ ] **Step 3:** Em `Pages/index.ts`: `create`/`delete`/`update: isAdminOrEditor` (páginas institucionais não são coisa de contributor), `read: authenticatedOrPublished` (mantido, já está correto).
- [ ] **Step 4:** Em `NewsletterSubscribers.ts`: `create`/`update`/`delete`/`read: isAdminOrEditor` (era `authenticated` — agora contributor não vê a lista de inscritos).
- [ ] **Step 5:** Rodar `docker compose exec web npm run build` pra confirmar que não quebrou nenhum tipo.
- [ ] **Step 6:** Commit: `git add apps/web/src/collections/Categories.ts apps/web/src/collections/Tags.ts apps/web/src/collections/AtlasLocations.ts apps/web/src/collections/Authors.ts apps/web/src/collections/Media.ts apps/web/src/collections/Pages/index.ts apps/web/src/collections/AffiliateLinks.ts apps/web/src/collections/NewsletterSubscribers.ts && git commit -m "feat: apply role-based access control to content collections"`

---

### Task 4: RBAC em `Posts` + hook anti-publicação de contributor

**Files:**
- Modify: `apps/web/src/collections/Posts/index.ts`
- Create: `apps/web/src/collections/Posts/hooks/preventContributorPublish.ts`
- Create: `apps/web/src/collections/Posts/hooks/setPostAuthorOnCreate.ts`

**Interfaces:**
- Consumes: `isAdminEditorOrOwnPost` (Task 2), que checa `authors.contains(user.id)` pra decidir "é dono do post".

**Cuidado (achado na revisão do plano, antes de executar):** `isAdminEditorOrOwnPost` decide posse checando o campo `authors` (relationship -> `users`, já existente). Nada preenche esse campo automaticamente hoje — um contributor que cria um post sem se adicionar manualmente em `authors` ficaria sem conseguir editar o próprio post depois (trancado fora). Por isso este hook novo:

- [ ] **Step 0:** Criar `apps/web/src/collections/Posts/hooks/setPostAuthorOnCreate.ts`:
```typescript
import type { CollectionBeforeChangeHook } from 'payload'

// DECISION: garante que quem cria o post já nasce dono dele (campo `authors`,
// usado por `isAdminEditorOrOwnPost` pra decidir posse). Sem isso, um
// contributor ficaria sem conseguir editar o próprio post logo após criá-lo.
export const setPostAuthorOnCreate: CollectionBeforeChangeHook = ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create' || !req.user) return data

  const currentAuthors = Array.isArray(data.authors) ? data.authors : []
  if (currentAuthors.includes(req.user.id)) return data

  return { ...data, authors: [...currentAuthors, req.user.id] }
}
```
- [ ] **Step 1:** Criar `apps/web/src/collections/Posts/hooks/preventContributorPublish.ts`:
```typescript
import type { CollectionBeforeChangeHook } from 'payload'

// DECISION: reforço server-side da regra "contributor não publica" (SPEC Módulo 2).
// Reverte silenciosamente pra draft em vez de lançar erro — o contributor
// continua conseguindo salvar o post, só não com status published.
export const preventContributorPublish: CollectionBeforeChangeHook = ({ data, req }) => {
  if (req.user?.role === 'contributor' && data._status === 'published') {
    return { ...data, _status: 'draft' }
  }
  return data
}
```
- [ ] **Step 2:** Em `Posts/index.ts`, trocar o `access` existente:
```typescript
access: {
  create: authenticated,
  delete: isAdminEditorOrOwnPost,
  read: authenticatedOrPublished,
  update: isAdminEditorOrOwnPost,
},
```
(mantém `create: authenticated` — qualquer papel logado pode criar um post, a restrição de dono só faz sentido pra editar/apagar um que já existe; `read` continua igual, não muda neste módulo.)
- [ ] **Step 3:** Adicionar os dois hooks em `hooks.beforeChange`, mantendo os que já existem (ordem importa: definir o autor antes de decidir sobre publicação):
```typescript
hooks: {
  beforeChange: [setPostAuthorOnCreate, preventContributorPublish],
  afterChange: [revalidatePost],
  afterRead: [populateAuthors],
  afterDelete: [revalidateDelete],
},
```
- [ ] **Step 4:** Rodar `docker compose exec web npm run build`.
- [ ] **Step 5:** Commit: `git add apps/web/src/collections/Posts && git commit -m "feat: restrict Posts access by role and block contributor publish"`

---

### Task 5: Verificação com 3 contas (admin/editor/contributor)

**Files:** nenhum novo — script descartável de verificação (`apps/web/scripts/verify-modulo-2.ts`, apagado ao final, mesmo padrão do Módulo 1).

- [ ] **Step 1:** Escrever script que, via Local API (`overrideAccess: true` só pra SETUP — os testes de fato usam `overrideAccess: false` simulando `req.user` de cada papel):
  1. Cria 3 usuários: `admin@test.local` (deve nascer `role: admin` por ser o primeiro), `editor@test.local` (`role: editor`), `contributor@test.local` (`role: contributor`).
  2. Confirma que o primeiro (`admin@test.local`) recebeu `role: admin` automaticamente mesmo sem pedir.
  3. Como `contributor`: cria um post próprio com `_status: 'published'` — confirma que salva como `draft` (hook reverteu).
  4. Como `contributor`: tenta editar um post de outro autor — confirma que é negado (403/erro de acesso, não exceção crua).
  5. Como `editor`: publica o post criado pelo contributor — confirma que funciona (`_status: 'published'` persiste).
  6. Como `contributor`: tenta ler/criar em `NewsletterSubscribers` — confirma negado.
  7. Limpa os registros de teste ao final.
- [ ] **Step 2:** Rodar `docker compose exec web npx tsx scripts/verify-modulo-2.ts` e reportar cada um dos 6 resultados.
- [ ] **Step 3:** Apagar o script (`rm apps/web/scripts/verify-modulo-2.ts`).
- [ ] **Step 4:** Login manual: usuário confirma em `http://localhost:3000/admin` que consegue logar com email/senha (pelo menos com a conta admin já existente ou uma nova).

## Definição de Pronto (Módulo 2)

- [ ] Login por email/senha funcional.
- [ ] `contributor` não consegue publicar (hook reverte pra draft), nem editar posts de terceiros, nem gerenciar usuários/newsletter.
- [ ] `editor`/`admin` conseguem publicar posts de terceiros.
- [ ] Tentativa de acesso negado retorna erro de acesso controlado (403), nunca uma exceção não tratada (500).
- [ ] Testado com 3 contas reais (uma por papel), não só lendo o código.
