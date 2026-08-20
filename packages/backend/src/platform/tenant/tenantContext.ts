import { AsyncLocalStorage } from "node:async_hooks";
import type { PrismaClient as TenantPrismaClient } from "../../generated/tenant/index.js";
import { AppError } from "../errors.js";
import { tenantConnectionManager } from "./TenantConnectionManager.js";

export interface TenantRequestContext {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  db: TenantPrismaClient;
}

const storage = new AsyncLocalStorage<TenantRequestContext>();

/**
 * Executa `fn` com o PrismaClient da empresa `tenantId` disponivel via
 * AsyncLocalStorage. Este e o UNICO lugar do sistema que decide qual banco
 * abrir — nenhum modulo de negocio importa PrismaClient diretamente nem
 * recebe connection string. E o que torna a estrategia de isolamento
 * trocavel sem reescrever os modulos.
 */
export async function withTenant<T>(
  params: { tenantId: string; tenantSlug: string; userId: string },
  fn: () => Promise<T>,
): Promise<T> {
  const db = await tenantConnectionManager.getClient(params.tenantId);
  return storage.run({ ...params, db }, fn);
}

/**
 * Entra no contexto de tenant chamando `callback` de forma SINCRONA por
 * dentro de `storage.run()`.
 *
 * Usado pelo preHandler de autenticacao do Fastify (`authenticate.ts`) no
 * estilo callback (`(request, reply, done)`), passando o proprio `done` do
 * Fastify como `callback`. Isso e proposital: `done` e a funcao que o
 * Fastify usa para continuar sua propria cadeia de hooks + handler, entao
 * chama-la de dentro de `run()` faz essa continuacao INTEIRA (demais hooks,
 * handler da rota) herdar o contexto — o mesmo principio do padrao
 * `als.run(store, next)` do Express.
 *
 * Uma versao `async/await` disso (entrar no contexto e so depois dar
 * `await` ate o Fastify seguir para o proximo hook) NAO tem essa garantia:
 * o hand-off para o proximo hook passa a depender de uma Promise que o
 * PROPRIO Fastify cria e encadeia por fora do nosso controle, e na pratica
 * isso quebra a propagacao (verificado empiricamente durante o
 * desenvolvimento).
 */
export function runInTenantStore<T>(
  params: { tenantId: string; tenantSlug: string; userId: string; db: TenantPrismaClient },
  callback: () => T,
): T {
  return storage.run(params, callback);
}

/** Le o contexto do tenant atual. Lanca se chamado fora de uma requisicao autenticada. */
export function getTenantContext(): TenantRequestContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw AppError.internal(
      "getTenantContext() chamado fora de withTenant() — todo acesso a dados de negocio precisa passar pelo middleware de tenant",
    );
  }
  return ctx;
}

/** Atalho usado pelos modulos de negocio: o client Prisma da empresa atual. */
export function tenantDb(): TenantPrismaClient {
  return getTenantContext().db;
}
