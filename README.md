# Blog de Viagem

Blog de viagem com área administrativa própria (Payload CMS), inspirado na estrutura do 360meridianos. Ver [`PRD-blog-viagem.md`](./PRD-blog-viagem.md) e [`SPEC-blog-viagem.md`](./SPEC-blog-viagem.md) para o produto e o plano de implementação por módulos.

## Stack

- Next.js 15 (App Router) + Payload 3 embutido (admin em `/admin`)
- Postgres 16 (via `@payloadcms/db-postgres`)
- Monorepo `npm workspaces` (`apps/web`)
- Docker Compose para ambiente local de desenvolvimento

## Pré-requisitos

- Docker + Docker Compose
- Node 20 (só necessário se for rodar fora do container, ex. para rodar lint/build local sem subir os containers)

## Setup local (objetivo: <15 min)

1. Copie o arquivo de variáveis de ambiente:
   ```bash
   cp .env.example .env
   ```
   Os valores default já funcionam para desenvolvimento local. Gere segredos reais (`PAYLOAD_SECRET`, `CRON_SECRET`, `PREVIEW_SECRET`) se for expor o ambiente além do seu próprio localhost — por exemplo:
   ```bash
   openssl rand -base64 32
   ```

2. Suba os containers:
   ```bash
   docker compose up
   ```
   Isso sobe o Postgres (com healthcheck) e a app Next.js/Payload em modo `next dev` com hot-reload, montando o repositório como volume.

3. Acesse:
   - Front público: [http://localhost:3000](http://localhost:3000)
   - Admin do Payload: [http://localhost:3000/admin](http://localhost:3000/admin) — na primeira visita, o próprio Payload pede pra criar o primeiro usuário admin.

4. Para parar: `Ctrl+C` ou `docker compose down` (use `docker compose down -v` só se quiser apagar os dados do Postgres também).

## Por que `next dev` no container, não build de produção?

O template do Payload executa `generateStaticParams` (consulta ao Postgres) durante o `next build`. Isso exigiria o container `web` enxergar o `postgres` já durante o `docker build` — o que não é possível, containers irmãos não têm rede entre si nesse estágio. Como este Compose é o ambiente de desenvolvimento local (produção é Vercel + Postgres gerenciado — ver PRD seção 7), o container roda `next dev`, que só consulta o banco a cada request, não durante o build da imagem.

## Troubleshooting

- **Porta 3000 já em uso**: pare o processo que está usando a porta, ou mude a porta publicada em `docker-compose.yml` (`ports: - "3001:3000"`, por exemplo) e acesse pela nova porta.
- **Erro de conexão com o Postgres** (`ECONNREFUSED`): confira se o serviço `postgres` está `healthy` (`docker compose ps`) e se `DATABASE_URL` no seu `.env` usa o host `postgres` (nome do serviço no Compose), não `localhost`.
- **Mudou uma dependência e o container não reflete**: rode `docker compose build web` pra reconstruir a imagem (o `node_modules` fica em volume anônimo, não é recriado automaticamente ao só reiniciar o container).

## Desenvolvimento sem Docker (opcional)

```bash
npm install
npm run dev -w apps/web
```
Requer um Postgres acessível localmente e as variáveis de `.env.example` exportadas ou em `apps/web/.env`.
