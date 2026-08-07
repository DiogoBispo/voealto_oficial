# SPEC-DRIVEN — Blog de Viagem
### Derivado de: PRD-blog-viagem.md

Metodologia: cada módulo abaixo é uma unidade implementável isoladamente, com contrato de dados, critérios de aceite e "definição de pronto". A ordem dos módulos é a ordem de implementação recomendada (dependências primeiro).

Convenção: `MUST` = obrigatório no MVP, `SHOULD` = fase 2, `MAY` = opcional/backlog.

---

## MÓDULO 0 — Infraestrutura Base

### 0.1 Especificação
- Repositório monorepo: `/apps/web` (Next.js), `/apps/cms` (Payload), config compartilhada em `/packages`
- Postgres provisionado (local via Docker Compose + produção gerenciado)
- Variáveis de ambiente documentadas em `.env.example` (DATABASE_URL, PAYLOAD_SECRET, S3_*, NEXTAUTH_*)
- CI mínimo: lint + typecheck + build em cada PR

### 0.2 Critérios de Aceite
- [ ] `docker-compose up` sobe Postgres local funcional
- [ ] `apps/cms` conecta no Postgres e roda migrations automáticas do Payload
- [ ] `apps/web` builda sem erros com dados mockados
- [ ] `.env.example` cobre 100% das variáveis usadas

### 0.3 Definição de Pronto
Ambiente local reproduzível por um novo dev em < 15 min seguindo o README.

---

## MÓDULO 1 — Modelagem de Conteúdo (Collections no Payload)

### 1.1 Especificação — Collections

**`posts`**
```ts
{
  title: string (required),
  slug: string (required, unique, auto-gerado de title, editável),
  excerpt: text (max 300 chars),
  coverImage: relationship -> media (required),
  body: richText (Lexical),
  status: select ['draft','scheduled','published'] (default: draft),
  publishedAt: date,
  author: relationship -> authors (required),
  categories: relationship -> categories (hasMany),
  tags: relationship -> tags (hasMany),
  locations: relationship -> atlasLocations (hasMany),
  sponsored: checkbox (default: false),
  seo: group { title: string, description: string, image: relationship -> media }
}
```

**`categories`**: `{ name, slug, description }`
**`tags`**: `{ name, slug }`
**`atlasLocations`**: `{ name, slug, type: select['continent','country','city'], parent: relationship -> self }`
**`authors`**: `{ name, bio: text, avatar: relationship -> media, socials: array{platform, url} }`
**`media`**: gerenciado nativamente pelo Payload (upload adapter -> S3/R2)
**`pages`**: `{ slug, title, body: richText, seo: group }`
**`affiliateLinks`**: `{ label, url, icon, order: number, active: checkbox }`
**`newsletterSubscribers`**: `{ email (unique), subscribedAt, source }`

### 1.2 Critérios de Aceite
- [ ] Todas as collections acima existem no admin do Payload com validação de campos obrigatórios
- [ ] Slug é gerado automaticamente mas editável, com validação de unicidade
- [ ] Relationship `atlasLocations.parent -> self` permite montar hierarquia continente > país > cidade
- [ ] Upload de imagem gera automaticamente ao menos 2 tamanhos (thumbnail + full) — usar plugin de resize do Payload

### 1.3 Definição de Pronto
Um editor consegue, via admin, criar um post completo (com imagem, categoria, autor, Atlas) sem usar o banco diretamente.

---

## MÓDULO 2 — Autenticação e Permissões (Admin)

### 2.1 Especificação
- Collection `users` (Payload nativo) com campo `role: select['admin','editor','contributor']`
- Regras de acesso (`access control` do Payload):
  - `admin`: CRUD completo em tudo, incluindo usuários
  - `editor`: CRUD em posts/categorias/tags/mídia, sem gerenciar usuários
  - `contributor`: cria/edita posts próprios, **não pode** mudar `status` para `published`

### 2.2 Critérios de Aceite
- [ ] Login por email/senha funcional
- [ ] `contributor` logado não vê opção de publicar (apenas salvar rascunho/enviar para revisão)
- [ ] `editor`/`admin` conseguem aprovar e publicar posts de terceiros
- [ ] Tentativa de acesso a rota admin sem permissão retorna 403, não 500

### 2.3 Definição de Pronto
Testado manualmente com 3 contas (uma por role) confirmando os limites de cada uma.

---

## MÓDULO 3 — API de Conteúdo (consumida pelo front)

### 3.1 Especificação — Endpoints (REST autogerado pelo Payload + endpoints customizados)

| Endpoint | Método | Descrição |
|---|---|---|
| `/api/posts?where[status][equals]=published&limit=12&page=1` | GET | Lista paginada de posts publicados |
| `/api/posts/:slug` | GET | Post por slug (custom endpoint, filtra status=published) |
| `/api/categories/:slug/posts` | GET | Posts de uma categoria |
| `/api/atlas/:slug/posts` | GET | Posts de uma localização |
| `/api/newsletter/subscribe` | POST | Cadastra email (custom endpoint, com rate limit) |

### 3.2 Critérios de Aceite
- [ ] Todos os endpoints de leitura retornam **apenas** conteúdo com `status=published` e `publishedAt <= now()` (agendados não vazam)
- [ ] Endpoint de newsletter rejeita emails duplicados e malformados, com rate limit (ex. 5 req/min/IP)
- [ ] Respostas paginadas seguem formato `{ docs, totalDocs, page, totalPages, hasNextPage }`

### 3.3 Definição de Pronto
Testes de integração (ex. via `supertest` ou Playwright API) cobrindo os 5 endpoints acima, incluindo caso de post agendado não aparecer antes da hora.

---

## MÓDULO 4 — Frontend Público: Listagens e Home

### 4.1 Especificação
- `/` (Home): SSG com revalidação (ISR, ex. 60s) — grid de destaques + faixa de afiliados + grid paginado
- `/categoria/[slug]`, `/atlas/[slug]`, `/tag/[slug]`: mesma UI de grid, dado via `getStaticProps`/`generateStaticParams` + ISR
- Componente `PostCard`: imagem (next/image), categoria, título, autor, data
- Paginação numérica (não infinite scroll, para manter paridade com referência e simplicidade de SEO)

### 4.2 Critérios de Aceite
- [ ] Home carrega < 2.5s LCP em teste local (Lighthouse)
- [ ] Grid paginado reflete corretamente `totalPages` da API
- [ ] Nenhuma página lista posts com status != published
- [ ] Imagens usam `next/image` com `alt` obrigatório (fallback = título do post se admin deixar vazio)

### 4.3 Definição de Pronto
Lighthouse SEO score ≥ 95 na Home e em uma página de categoria.

---

## MÓDULO 5 — Frontend Público: Página de Post

### 5.1 Especificação
- Rota `/[slug]` com `generateStaticParams` (SSG) + ISR
- Renderiza richText do Lexical (serializer custom para HTML semântico)
- Seção de posts relacionados (mesma categoria, exclui o post atual, limit 3)
- Meta tags dinâmicas (`generateMetadata`) usando campos `seo.*` com fallback para `title`/`excerpt`/`coverImage`
- JSON-LD `Article` schema
- Se `sponsored=true`, exibir badge "Conteúdo patrocinado" visível

### 5.2 Critérios de Aceite
- [ ] `<title>` e `<meta description>` batem com os campos SEO do post (ou fallback correto)
- [ ] JSON-LD validado no Rich Results Test do Google
- [ ] Post com `sponsored=true` mostra o badge; `false` não mostra
- [ ] Post com `status != published` retorna 404 no front (não deve ser acessível por URL direta)

### 5.3 Definição de Pronto
3 posts de teste (1 normal, 1 patrocinado, 1 rascunho) validam os 4 critérios acima.

---

## MÓDULO 6 — Sitemap e SEO Técnico

### 6.1 Especificação
- `/sitemap.xml` gerado dinamicamente (Next route handler), incluindo posts, categorias, atlas e páginas institucionais
- `/robots.txt` estático apontando para o sitemap
- Redirecionamento 301 configurável (tabela `redirects` no Payload) — necessário se houver migração de URLs antigas

### 6.2 Critérios de Aceite
- [ ] Sitemap reflete apenas conteúdo publicado, atualizado a cada novo post (revalidação)
- [ ] Redirect cadastrado no admin funciona sem deploy

### 6.3 Definição de Pronto
Sitemap validado no Google Search Console (submissão de teste).

---

## MÓDULO 7 — Newsletter

### 7.1 Especificação
- Form de captação (Home + rodapé de post) chamando `/api/newsletter/subscribe`
- MUST: salvar em `newsletterSubscribers` no Postgres (lista sob controle do cliente)
- SHOULD: integração com provedor de disparo (Resend/Mailchimp) via webhook pós-cadastro

### 7.2 Critérios de Aceite
- [ ] Cadastro duplicado não gera erro 500, retorna mensagem amigável "já inscrito"
- [ ] Email inválido é rejeitado no client E no server (nunca confiar só no client)

### 7.3 Definição de Pronto
Lista de subscribers exportável via admin do Payload (CSV).

---

## MÓDULO 8 — Migração de Conteúdo (condicional)

> Só entra no escopo se o cliente confirmar posts existentes para migrar (pergunta em aberto no PRD).

### 8.1 Especificação
- Script de importação (Node) lendo export do sistema de origem (ex. WXR do WordPress) e populando `posts`, `categories`, `authors`, `media` via API do Payload
- Preservar `slug` original para não quebrar SEO/backlinks
- Gerar tabela de `redirects` para URLs que mudarem de padrão

### 8.2 Critérios de Aceite
- [ ] Rodar em modo dry-run (relatório do que seria importado, sem gravar)
- [ ] 100% das imagens referenciadas são baixadas e re-hospedadas no storage novo
- [ ] Slugs preservados ou redirect criado automaticamente para os que mudarem

### 8.3 Definição de Pronto
Importação de uma amostra (ex. 20 posts) validada manualmente antes de rodar full.

---

## Ordem de Implementação Recomendada

```
0. Infraestrutura Base
1. Modelagem de Conteúdo
2. Autenticação e Permissões
3. API de Conteúdo
4. Frontend: Home/Listagens
5. Frontend: Página de Post
6. Sitemap/SEO técnico
7. Newsletter
8. Migração (condicional, pode rodar em paralelo com 4-7 se o dry-run já validar o mapeamento)
```

Cada módulo deve ser um PR isolado, com os critérios de aceite da seção correspondente como checklist do PR — isso é o que torna isso "spec-driven" na prática: nada é considerado "pronto" sem passar pelos critérios explícitos, não por sensação de "parece que funciona".

---

## Riscos técnicos específicos deste SPEC (não repetidos do PRD)

- **Serializer do Lexical → HTML**: é comum posts com embeds (YouTube/Instagram) quebrarem no serializer custom. Escrever teste com um post "kitchen sink" (todos os tipos de bloco) antes de dar como pronto o Módulo 5.
- **ISR + conteúdo agendado**: se o post tem `publishedAt` futuro, a revalidação por tempo (ISR) pode publicá-lo "atrasado" (só aparece depois do próximo revalidate). Se agendamento fino for importante, considerar `on-demand revalidation` disparada por webhook do Payload no momento exato da publicação, em vez de confiar só no intervalo de ISR.
