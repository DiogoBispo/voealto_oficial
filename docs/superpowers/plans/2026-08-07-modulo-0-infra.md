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

- [ ] **Step 1:** Rodar `npx create-payload-app@latest apps/web --template website --db postgres --no-git` (template inclui Next.js App Router + Payload já integrados).
- [ ] **Step 2:** Criar `package.json` na raiz:
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
- [ ] **Step 3:** Criar `.gitignore` na raiz cobrindo `node_modules/`, `.next/`, `.env`, `apps/web/.env`.
- [ ] **Step 4:** Rodar `npm install` na raiz e confirmar que resolve sem erro.
- [ ] **Step 5:** Commit: `git add package.json .gitignore apps/web && git commit -m "chore: scaffold monorepo and payload+next app"`

---

### Task 2: Dockerfile multi-stage para apps/web

**Files:**
- Create: `apps/web/Dockerfile`
- Create: `apps/web/.dockerignore`

**Interfaces:**
- Consumes: `apps/web/package.json` gerado na Task 1.
- Produces: imagem Docker `blog-viagem-web` usada pelo `docker-compose.yml` da Task 3.

- [ ] **Step 1:** Criar `apps/web/.dockerignore`:
```
node_modules
.next
.env
.git
```
- [ ] **Step 2:** Criar `apps/web/Dockerfile`:
```dockerfile
# --- deps ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- build ---
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/next.config.* ./
COPY --from=build /app/public ./public
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["npm", "start"]
```
- [ ] **Step 3:** Validar sintaticamente sem Docker: `docker build` não está disponível aqui — em vez disso, rodar `npm run build -w apps/web` localmente e confirmar que builda sem erro (mesmo comando que o estágio `build` do Dockerfile executa).
- [ ] **Step 4:** Commit: `git add apps/web/Dockerfile apps/web/.dockerignore && git commit -m "feat: add multi-stage dockerfile for web app"`

---

### Task 3: docker-compose.yml + .env.example

**Files:**
- Create: `docker-compose.yml` (raiz)
- Create: `.env.example` (raiz)

**Interfaces:**
- Consumes: `apps/web/Dockerfile` (Task 2), variável `DATABASE_URI` esperada por `apps/web/src/payload.config.ts` (gerado pelo template na Task 1).
- Produces: comando `docker compose up` funcional (a ser validado pelo usuário, ver Global Constraints).

- [ ] **Step 1:** Criar `.env.example` na raiz:
```
# Postgres
POSTGRES_USER=blogviagem
POSTGRES_PASSWORD=changeme
POSTGRES_DB=blogviagem
DATABASE_URI=postgres://blogviagem:changeme@postgres:5432/blogviagem

# Payload
PAYLOAD_SECRET=changeme-generate-a-real-secret

# Next.js
NEXT_PUBLIC_SERVER_URL=http://localhost:3000
```
- [ ] **Step 2:** Criar `docker-compose.yml`:
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
      context: ./apps/web
      dockerfile: Dockerfile
    restart: unless-stopped
    env_file: .env
    environment:
      DATABASE_URI: ${DATABASE_URI}
      PAYLOAD_SECRET: ${PAYLOAD_SECRET}
      NEXT_PUBLIC_SERVER_URL: ${NEXT_PUBLIC_SERVER_URL}
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
```
- [ ] **Step 3:** Confirmar que `.env.example` cobre 100% das variáveis referenciadas em `docker-compose.yml` e em `apps/web/src/payload.config.ts` (grep por `process.env` em `apps/web/src`).
- [ ] **Step 4:** Commit: `git add docker-compose.yml .env.example && git commit -m "feat: add docker-compose with postgres and web services"`

---

### Task 4: README de setup local

**Files:**
- Create: `README.md` (raiz)

**Interfaces:**
- Consumes: comandos definidos nas Tasks 1–3.

- [ ] **Step 1:** Criar `README.md` com: pré-requisitos (Docker + Docker Compose), passo `cp .env.example .env`, passo `docker compose up`, URL do admin (`http://localhost:3000/admin`), como criar o primeiro usuário admin, troubleshooting básico (porta ocupada, `DATABASE_URI` errado).
- [ ] **Step 2:** Commit: `git add README.md && git commit -m "docs: add local setup instructions"`

---

## Definição de Pronto (Módulo 0)

- [ ] `npm install` + `npm run build -w apps/web` rodam sem erro neste ambiente.
- [ ] `docker-compose.yml` e `.env.example` revisados e cobrindo todas as variáveis (validação estática, já que Docker não roda aqui).
- [ ] Usuário confirma manualmente que `docker compose up` sobe Postgres + app e que `/admin` carrega.
