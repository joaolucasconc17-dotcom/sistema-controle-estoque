# Estoque SaaS — Sistema de Controle de Estoque Multiempresa

Sistema de controle de estoque de nivel empresarial, construido para ser
vendido como SaaS a multiplas empresas. Cada empresa cliente (tenant) tem seu
proprio banco de dados fisico — isolamento maximo, sem risco de vazamento de
dados entre clientes.

O plano completo de arquitetura e fases esta em
`C:\Users\pc\.claude\plans\eager-stargazing-widget.md`.

## Status atual

**Fase 0 (Fundacao) concluida e verificada de ponta a ponta:**
monorepo, infraestrutura Docker, control plane, tenant router com pool de
conexoes limitado (LRU), provisionamento de empresas, autenticacao JWT com
refresh rotativo e deteccao de furto, e RBAC com 5 perfis padrao.

**Fase 1 (Cadastros) concluida e verificada de ponta a ponta:**
filiais, depositos, enderecos de estoque, unidades de medida, categorias,
produtos (com multiplos codigos de barra e campos fiscais), fornecedores e o
vinculo produto-fornecedor. Paginacao por cursor testada, auditoria gravando
create/update, e checagem de permissao confirmada negando escrita para o
perfil LEITURA enquanto libera leitura.

Rotas: `/api/org/company-units`, `/api/org/warehouses`,
`/api/org/warehouses/:id/locations`, `/api/catalog/units-of-measure`,
`/api/catalog/categories`, `/api/catalog/products` (+ `/by-barcode/:barcode`),
`/api/catalog/suppliers` (+ `/:id/products` para o vinculo).

Fases seguintes (motor de estoque, compras, relatorios, frontend) ainda nao
foram implementadas — ver o plano acima para o roteiro completo.

## Arquitetura em uma imagem

```
                     ┌─────────────────────────┐
                     │   control plane (1 db)   │   catalogo de empresas:
                     │   estoque_control         │   quem existe, onde fica
                     └───────────┬───────────────┘   o banco de cada uma
                                 │
                     TenantRegistry + TenantConnectionManager
                     (cache Redis + pool LRU de PrismaClient)
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
     tenant_empresa_a    tenant_empresa_b    tenant_empresa_c   ...
     (banco fisico        (banco fisico       (banco fisico
      dedicado)            dedicado)           dedicado)
```

Nenhum modulo de negocio (`src/modules/*`) importa `PrismaClient`
diretamente. Todos leem o client do tenant atual via `tenantDb()`
(`src/platform/tenant/tenantContext.ts`), que usa `AsyncLocalStorage` para
propagar o contexto do middleware de autenticacao ate o handler da rota.
Isso mantem a estrategia de isolamento trocavel sem reescrever os modulos.

## Requisitos

- Node.js 20+
- Docker Desktop (Postgres + Redis)

## Quickstart

```bash
# 1. instalar dependencias do monorepo
npm install

# 2. copiar variaveis de ambiente
cp .env.example .env
cp .env.example packages/backend/.env   # Prisma CLI le o .env daqui quando
                                          # rodado de dentro do workspace

# 3. gerar segredos (rode 3x e cole em DATASOURCE_ENCRYPTION_KEY,
#    JWT_ACCESS_SECRET, JWT_REFRESH_SECRET nos DOIS arquivos .env acima)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. IMPORTANTE: se a porta 5432 ja estiver em uso no seu host (ex.: um
#    Postgres nativo do Windows/Mac ja instalado), mude POSTGRES_PORT e
#    TENANT_DB_PORT no .env para 5433 antes de subir os containers —
#    foi exatamente o caso neste ambiente de desenvolvimento.

# 5. subir Postgres e Redis
npm run infra:up

# 6. aplicar as migrations do control plane
npm run control:generate -w @estoque/backend
npm run control:migrate:dev -w @estoque/backend

# 7. gerar o client do tenant plane (as migrations de tenant ja vem prontas
#    em prisma/tenant/migrations/ — cada empresa nova as aplica sozinha
#    durante o provisionamento, nao precisa rodar migrate dev de novo)
npm run tenant:generate -w @estoque/backend

# 8. provisionar sua primeira empresa
npm run provision:tenant -- \
  --nome "Minha Empresa" \
  --owner-nome "Seu Nome" \
  --owner-email voce@suaempresa.com \
  --owner-senha "SenhaForte123!"

# 9. subir o backend
npm run dev:backend
```

Testar:

```bash
curl -X POST http://localhost:3333/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"voce@suaempresa.com","password":"SenhaForte123!"}'
```

## Scripts principais (raiz do monorepo)

| Script | O que faz |
|---|---|
| `npm run infra:up` / `infra:down` | Sobe/derruba Postgres e Redis via Docker |
| `npm run dev:backend` | Backend em modo watch |
| `npm run provision:tenant -- --nome "..." --owner-nome "..." --owner-email ... --owner-senha ...` | Cria uma empresa nova de ponta a ponta |
| `npm run migrate:tenants` | Aplica migrations pendentes em TODAS as empresas ativas |
| `npm run typecheck` / `npm test` | Roda em todos os workspaces |

## Estrutura

```
packages/
  shared/    contratos Zod + enums compartilhados entre backend e frontend
  backend/
    prisma/control/   schema do catalogo de empresas (1 banco)
    prisma/tenant/     schema de negocio (replicado por empresa)
    src/platform/      tenant router, auth, config, http, migrations
    src/modules/       regras de negocio por dominio (iam, catalog, inventory, ...)
  frontend/  (ainda nao criado — Fase 5 do plano)
```

## Decisoes de arquitetura que valem a pena lembrar

- **Banco por empresa**: isolamento maximo, mas o custo escala com o numero
  de clientes. `TenantConnectionManager` limita quantos bancos ficam
  conectados ao mesmo tempo (`TENANT_POOL_MAX_CLIENTS`, default 50) e
  despeja os ociosos — sem isso, centenas de empresas esgotam
  `max_connections` do Postgres.
- **Refresh token rotativo com deteccao de reuso**: cada refresh gera um
  token novo e revoga o anterior. Se um token ja revogado for apresentado de
  novo (sinal de roubo), a familia inteira e derrubada — verificado em teste
  manual durante o desenvolvimento.
- **RBAC por permissao, nao por nome de perfil**: os 5 perfis
  (`OWNER`, `ADMIN`, `GERENTE_ESTOQUE`, `OPERADOR`, `LEITURA`) sao so
  agrupamentos de permissoes granulares (`src/modules/iam/rolePermissions.ts`).
  Toda autorizacao verifica a permissao.
- **`stock_balance` com `NULLS NOT DISTINCT`**: produtos sem rastreio de
  lote tem `batchId` sempre nulo. Uma unique constraint comum do Postgres
  trataria cada NULL como distinto, permitindo saldo duplicado — corrigido
  via migration manual (`prisma/tenant/migrations/20260820143700_.../`).
