# PRD — Blog de Viagem com Área Administrativa
### Referência de estrutura: 360meridianos.com

---

## 1. Contexto e Objetivo

Construir um blog de viagem para um cliente, com estrutura e organização de conteúdo inspiradas no site 360meridianos, incluindo uma área administrativa própria para que o cliente publique, edite e organize posts sem depender de desenvolvedor.

**Objetivo de negócio:** publicar conteúdo editorial de viagem (roteiros, dicas, guias por destino) de forma recorrente, com boa indexação SEO e monetização via afiliados (hospedagem, seguro viagem, passeios, aluguel de carro, etc.) e/ou publicidade.

**Fora de escopo nesta v1:** e-commerce, área de membros/paywall, app mobile nativo, comentários com moderação avançada (pode ficar para fase 2).

---

## 2. Decisão de Arquitetura (ponto de atenção)

Duas rotas possíveis com a stack solicitada (React + Node + Postgres):

| Opção | Descrição | Prós | Contras |
|---|---|---|---|
| **A. CMS 100% custom** | Painel admin próprio em React, API Node própria, Postgres cru | Controle total, zero dependência externa | Alto custo de desenvolvimento e manutenção (editor rich-text, upload de imagem, versionamento, rascunhos, SEO fields, etc. tudo do zero) |
| **B. Headless CMS sobre Postgres (recomendado)** | Strapi ou Payload CMS como backend/admin, rodando sobre Postgres, consumido via API REST/GraphQL pelo front em React | Admin pronto e testado, upload de mídia, RBAC, webhooks, SEO plugin, muito menos tempo de dev | Menos "sob medida"; aprendizado da ferramenta |

Este PRD é escrito para a **Opção B (Payload CMS ou Strapi + Postgres)**, mantendo 100% a stack pedida (Node/Postgres) e React no front. Se o cliente insistir na Opção A, a seção 6 (modelo de dados) e a seção 7 (admin) servem como base para construir o CRUD manualmente — o esforço estimado dobra ou triplica.

---

## 3. Personas

- **Leitor do blog**: busca conteúdo de viagem via Google/redes sociais, quer ler roteiros, ver fotos, encontrar dicas práticas.
- **Cliente (editor/admin)**: sem conhecimento técnico, precisa publicar posts, subir imagens, organizar por categoria, agendar publicações, editar SEO básico.
- **Anunciante/parceiro (indireto)**: consome links de afiliado inseridos nos posts.

---

## 4. Estrutura do Site Público (baseada no 360meridianos)

### 4.1 Navegação principal
- Home
- Especiais *(coleções/séries editoriais em destaque)*
- Artigos *(conteúdo geral não-destino)*
- Atlas *(índice por país/continente/destino)*
- Dicas de Viagem *(categoria)*
- Sobre
  - Contato
  - Manifesto (texto institucional — pode virar "Nossa história")
  - Notícias (imprensa/menções)
- CTA de destaque: "Parcerias & Descontos" (hub de links de afiliado)

### 4.2 Home
- Grid de posts em destaque (4 primeiros, cards com imagem, categoria, título, autor, data)
- Faixa de links de afiliados (Hospedagem, Seguro Viagem, Passeios, Chip, Passagens, Aluguel de Carro, Trens/Ônibus)
- Segunda leva de posts recentes
- Bloco de captação de newsletter (embed ou form próprio)
- Grid paginado de últimos posts (paginação numérica)

### 4.3 Página de Post
- Imagem de capa
- Título, categoria, autor, data
- Corpo em rich text (H2/H3, imagens inline, listas, blockquotes, embeds)
- Links de afiliado inline (marcados como "publi" quando aplicável — ver seção 9)
- Compartilhamento social
- Posts relacionados (mesma categoria)
- Newsletter CTA
- Comentários (fase 2 — Disqus ou custom)

### 4.4 Páginas de listagem (Categoria/Tag/Autor/Atlas)
- Mesma grade de cards da home, filtrada
- "Atlas" é um caso especial: taxonomia geográfica (continente > país > cidade), útil pensar como taxonomia própria além de categoria/tag padrão

### 4.5 Páginas institucionais
- Sobre, Manifesto, Contato (form simples), Política comercial, Política de privacidade, Anuncie conosco, Colabore conosco

### 4.6 Footer
- Menu replicado, redes sociais (Facebook, YouTube, Instagram, Pinterest, TikTok), logo de selo/certificação (ex. ABBV — associação de blogueiros de viagem), formulário de newsletter, copyright

---

## 5. Área Administrativa (Opção B: Payload/Strapi)

### 5.1 Gestão de conteúdo
- CRUD de Posts: título, slug (auto + editável), imagem de capa, corpo rich text, categoria(s), tags, autor, status (rascunho/publicado/agendado), data de publicação
- Editor rich text com upload de imagem inline, embeds (YouTube, Instagram, Substack)
- Upload de mídia com biblioteca reutilizável (evitar re-upload)
- CRUD de Categorias e Tags
- CRUD de Taxonomia "Atlas" (continente/país/cidade) — collection separada, relacionada a posts
- CRUD de Autores (nome, bio, avatar, redes sociais)
- Gestão de Páginas institucionais (Sobre, Manifesto, Políticas) como conteúdo editável, não hardcoded
- Gestão do bloco "Parcerias & Descontos" (lista de links de afiliado editável sem deploy)

### 5.2 SEO por post
- Meta título, meta descrição, imagem OG (fallback = capa do post)
- Slug customizável
- Preview de como aparece no Google/redes antes de publicar

### 5.3 Usuários e permissões
- Papéis: Admin (cliente/dono), Editor (redator), Colaborador (rascunho apenas, sem publicar)
- Autenticação simples (email/senha + opcional SSO Google)

### 5.4 Publicação
- Rascunho → Revisão → Agendado → Publicado
- Agendamento por data/hora

---

## 6. Modelo de Dados (alto nível)

```
posts
 - id, title, slug, excerpt, cover_image_id, body (richtext/json),
   status, published_at, author_id, seo_title, seo_description, seo_image_id,
   created_at, updated_at

categories
 - id, name, slug, description

tags
 - id, name, slug

post_categories (N:N)
post_tags (N:N)

atlas_locations
 - id, name, slug, type (continent|country|city), parent_id

post_locations (N:N) -- relaciona post ao Atlas

authors
 - id, name, bio, avatar_id, socials (json)

media
 - id, url, alt_text, width, height, uploaded_by

affiliate_links
 - id, label, url, icon, order, active

pages
 - id, slug, title, body (richtext), seo_title, seo_description

newsletter_subscribers
 - id, email, subscribed_at, source
```

*(Se optarem pela Opção B, esse schema é majoritariamente gerado automaticamente pelo Payload/Strapi via collections — não precisa migração manual.)*

---

## 7. Stack Técnica Proposta

- **Frontend**: Next.js (React) — SSR/SSG para SEO, essencial para um blog. *(React puro com Vite não é ideal aqui por causa de SEO/indexação — vale essa ressalva)*
- **Backend/CMS**: Payload CMS (Node + roda nativamente sobre Postgres) — admin pronto, API REST/GraphQL automática
- **Banco**: PostgreSQL
- **Storage de mídia**: S3-compatible (Cloudflare R2 ou AWS S3) integrado ao Payload
- **Newsletter**: integração via API (ex. Substack, Mailchimp ou Resend + lista própria)
- **Deploy**: Frontend na Vercel; backend/admin em VPS ou Railway/Render com Postgres gerenciado
- **CDN/Imagens**: otimização automática via Next/Image

> Se a decisão for pela **Opção A (custom)**: troque Payload por uma API Express/Fastify própria com Prisma/Drizzle ORM sobre Postgres, e construa o painel admin como app React separado (ou rotas `/admin` no Next). Estimar 3-4x mais horas de desenvolvimento no backend/admin.

---

## 8. Requisitos Não-Funcionais

- **SEO**: sitemap.xml automático, meta tags dinâmicas, dados estruturados (Article/BreadcrumbList), URLs amigáveis, Core Web Vitals (SSG/ISR no Next)
- **Performance**: LCP < 2.5s, imagens otimizadas/lazy-load
- **Acessibilidade**: contraste AA, alt text obrigatório em imagens (campo no admin)
- **Responsividade**: mobile-first (maioria do tráfego de blog vem de mobile/social)
- **Backup**: backup diário do Postgres e da mídia

---

## 9. Riscos e Pontos de Atenção

- **Rich text editor**: é o componente mais arriscado de construir do zero — recomenda-se fortemente usar o editor embutido do Payload (Lexical) em vez de construir um customizado.
- **Migração de conteúdo**: se o cliente já tem posts em outro sistema, prever import (o 360meridianos tem 165+ páginas de posts — se for o volume esperado, migração não é trivial).
- **Divulgação de links patrocinados**: por transparência (e exigência legal/CONAR no Brasil), posts com afiliados devem sinalizar isso — vale um campo booleano "conteúdo patrocinado" no post.
- **Dependência de terceiros**: se usar Substack para newsletter (como o site de referência), a lista de emails não fica 100% sob controle do cliente — considerar captar direto no banco próprio também.

---

## 10. Fases sugeridas

1. **Fase 1 (MVP)**: Home, listagem por categoria, página de post, Atlas básico, admin com CRUD de posts/categorias/mídia, SEO por post
2. **Fase 2**: Newsletter própria, páginas institucionais editáveis, afiliados editáveis via admin, agendamento de posts
3. **Fase 3**: Comentários, múltiplos autores com perfis públicos, analytics interno de posts mais lidos

---

## 11. Perguntas em aberto para o cliente

- Volume estimado de posts já existentes para migração?
- Vai usar Substack (como o site referência) ou quer newsletter própria?
- Precisa de múltiplos editores/redatores desde o início ou só o cliente vai postar?
- Já tem identidade visual definida ou o layout deve ser criado do zero inspirado na referência?
