# Módulo 0 — Infraestrutura Base — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docker compose up` sobe Postgres + a app Next.js/Payload conectados, com hot-reload em dev, reproduzível por um novo dev em <15min.

**Architecture:** Monorepo npm workspaces com uma única app (`apps/web`) rodando Next.js 15 + Payload 3 embutido (admin em `/admin`), Postgres via adapter oficial `@payloadcms/db-postgres`. Dois containers: `postgres` e `web`.

**Tech Stack:** Node 20, Next.js 15, Payload 3, `@payloadcms/db-postgres`, Postgres 16, Docker Compose, npm workspaces, TypeScript 5.

## Global Constraints

- Sem `docker`/`docker compose` disponível no ambiente de execução do agente — cada task que envolve rodar containers deve ser validada por comandos que não dependem de Docker (`npm run build`, `npm run lint`) sempre que possível; a validação final com `docker compose up` fica marcada como "verificar manualmente" para o usuário.
- Nenhuma variável de ambiente com valor real commitada — apenas `.env.example` com placeholders.
- `git init` já executado na raiz do projeto.

---

### Task 1: Root workspace + scaffold da app

**Files:**
- Create: `package.json` (raiz)
- Create: `.gitignore` (raiz)
- Create: `apps/web/` (via `create-payload-app`)

**Interfaces:**
- Produces: workspace `apps/web` instalável via `npm install` na raiz; script raiz `npm run dev -w apps/web`.

- [x] **Step 1:** Rodar `npx create-payload-app@latest apps/web --template website --db postgres --no-git` (template inclui Next.js App Router + Payload já integrados).
- [x] **Step 2:** Criar `package.json` na raiz:
```json
{
  "name": "blog-viagem",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "npm run dev -w apps/web",
    "build": "npm run build -w apps/web",
    "lint": "npm run lint -w apps/web"
  }
}
```
- [x] **Step 3:** Criar `.gitignore` na raiz cobrindo `node_modules/`, `.next/`, `.env`, `apps/web/.env`, `SKILLS/` (repo vendorizado de referência, não faz parte do código do projeto) e `.claude/` (config local).
- [x] **Step 4:** Rodar `npm install` na raiz e confirmar que resolve sem erro.
- [x] **Step 5:** Commit: `git add package.json .gitignore apps/web && git commit -m "chore: scaffold monorepo and payload+next app"`

---

### Task 2: Dockerfile de desenvolvimento para apps/web

> **DECISION (revisada após testar o build real):** o template do Payload roda `generateStaticParams` contra o Postgres durante o `next build`. Num `docker build` isso falha, porque o container `web` não enxerga o container `postgres` nesse estágio (containers irmãos não têm rede entre si durante build, só em runtime via compose). Como o Docker Compose aqui é o **ambiente local de desenvolvimento** (produção é Vercel + Postgres gerenciado — PRD seção 7), o Dockerfile deste módulo roda `next dev`, não um build de produção. Build de produção fica para quando o deploy for tratado (fora do escopo do MVP/Módulo 0). Isso também elimina o problema de standalone output do Next, que exigiria reestruturar o `next.config.ts`.
>
> Também corrigido nesta revisão: build/monorepo é **npm workspaces com node_modules hoisted na raiz** — o contexto de build tem que ser a raiz do repo, não `apps/web/`, senão o container não vê o `node_modules` raiz nem o `package-lock.json` do workspace.

**Files:**
- Overwrite: `apps/web/Dockerfile` (o scaffolder gerou um Dockerfile de produção Mongo/yarn/standalone genérico — substituir)
- Delete: `apps/web/docker-compose.yml` (o scaffolder gerou um compose com Mongo — redundante e incorreto, o compose real é o da raiz, Task 3)
- Create: `.dockerignore` (raiz)

**Interfaces:**
- Consumes: `package.json` + `package-lock.json` da raiz e `apps/web/package.json` (Task 1).
- Produces: imagem Docker usada pelo serviço `web` do `docker-compose.yml` da Task 3, contexto de build = raiz do repo.

- [x] **Step 1:** Criar `.dockerignore` na raiz:
```
node_modules
.next
.env
.git
SKILLS
```
- [x] **Step 2:** Apagar `apps/web/docker-compose.yml` (Mongo, não se aplica): `rm apps/web/docker-compose.yml`.
- [x] **Step 3:** Sobrescrever `apps/web/Dockerfile` (build context = raiz do repo, ver `dockerfile:`/`context:` no compose da Task 3):
```dockerfile
FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM node:20-alpine AS dev
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["npm", "run", "dev"]
```
- [x] **Step 4:** Validar sem Docker: confirmar que `npm run build -w apps/web` (com `DATABASE_URL` e `PAYLOAD_SECRET` de exemplo exportados no shell) compila e só falha na etapa de conexão real ao Postgres (`ECONNREFUSED`) — isso confirma que o código está correto e o único bloqueio é a ausência de um Postgres real, esperado neste ambiente sem Docker.
- [x] **Step 5:** Commit: `git add apps/web/Dockerfile .dockerignore && git rm apps/web/docker-compose.yml && git commit -m "feat: replace scaffolded dockerfile/compose with npm+postgres dev container"`

---

### Task 3: docker-compose.yml + .env.example

> **DECISION:** o código gerado usa `process.env.DATABASE_URL` (não `DATABASE_URI` como o SPEC nomeia em prosa) — seguindo o código real, não o texto do SPEC, para não ter que tocar em `payload.config.ts`. `CRON_SECRET` e `PREVIEW_SECRET` também são lidos pelo template (rotas de preview/cron do site institucional) — incluídos no `.env.example` para não faltar nenhuma variável usada (critério de aceite do SPEC 0.2).

**Files:**
- Create: `docker-compose.yml` (raiz)
- Create: `.env.example` (raiz) — substitui/complementa o `apps/web/.env.example` gerado pelo scaffolder
- Delete: `apps/web/.env.example` (consolidado no `.env.example` da raiz, único lugar de verdade)

**Interfaces:**
- Consumes: `apps/web/Dockerfile` (Task 2), variável `DATABASE_URL` esperada por `apps/web/src/payload.config.ts` (gerado pelo template na Task 1).
- Produces: comando `docker compose up` funcional (a ser validado pelo usuário, ver Global Constraints).

- [x] **Step 1:** Apagar `apps/web/.env.example`: `git rm apps/web/.env.example`.
- [x] **Step 2:** Criar `.env.example` na raiz:
```
# Postgres
POSTGRES_USER=blogviagem
POSTGRES_PASSWORD=changeme
POSTGRES_DB=blogviagem
DATABASE_URL=postgres://blogviagem:changeme@postgres:5432/blogviagem

# Payload
PAYLOAD_SECRET=changeme-generate-a-real-secret

# Next.js
NEXT_PUBLIC_SERVER_URL=http://localhost:3000

# Template do site institucional (rotas de preview/cron do Payload website template)
CRON_SECRET=changeme-generate-a-real-secret
PREVIEW_SECRET=changeme-generate-a-real-secret
```
- [x] **Step 3:** Criar `docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 5

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URL: ${DATABASE_URL}
      PAYLOAD_SECRET: ${PAYLOAD_SECRET}
      NEXT_PUBLIC_SERVER_URL: ${NEXT_PUBLIC_SERVER_URL}
      CRON_SECRET: ${CRON_SECRET}
      PREVIEW_SECRET: ${PREVIEW_SECRET}
    volumes:
      - .:/repo
      - /repo/node_modules
      - /repo/apps/web/.next
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
```
  (os volumes `/repo/node_modules` e `/repo/apps/web/.next` são anônimos e existem só pra não deixar o bind mount `.:/repo` sobrescrever o que já foi instalado/buildado dentro da imagem — permite hot-reload do código montando o repo mas preservando `node_modules` do container.)
- [x] **Step 4:** Confirmar que `.env.example` cobre 100% das variáveis referenciadas em `docker-compose.yml` e em `apps/web/src/payload.config.ts` (grep por `process.env` em `apps/web/src`).
- [x] **Step 5:** Commit: `git add docker-compose.yml .env.example && git rm apps/web/.env.example && git commit -m "feat: add docker-compose with postgres and web dev services"`

---

### Task 4: README de setup local

**Files:**
- Create: `README.md` (raiz)

**Interfaces:**
- Consumes: comandos definidos nas Tasks 1–3.

- [x] **Step 1:** Criar `README.md` com: pré-requisitos (Docker + Docker Compose), passo `cp .env.example .env`, passo `docker compose up`, URL do admin (`http://localhost:3000/admin`), como criar o primeiro usuário admin, troubleshooting básico (porta ocupada, `DATABASE_URI` errado).
- [x] **Step 2:** Commit: `git add README.md && git commit -m "docs: add local setup instructions"`

---

## Definição de Pronto (Módulo 0)

- [x] `npm install` + `npm run build -w apps/web` rodam sem erro de código neste ambiente (o único erro restante é `ECONNREFUSED` por não haver Postgres real disponível aqui — esperado e documentado, não é falha de configuração).
- [x] `docker-compose.yml` e `.env.example` revisados e cobrindo todas as variáveis usadas em `apps/web/src` (validação estática via grep, já que Docker não roda neste ambiente de execução).
- [ ] **Pendente do usuário:** confirmar manualmente que `docker compose up` sobe Postgres + app e que `/admin` carrega em `http://localhost:3000/admin`.
