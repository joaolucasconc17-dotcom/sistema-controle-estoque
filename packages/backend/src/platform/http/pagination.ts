import type { CursorPage, CursorPageQuery } from "@estoque/shared";

/**
 * Pagina qualquer `findMany` do Prisma por cursor. Pede `limit + 1` linhas;
 * se voltar mais que `limit`, sobra uma linha que vira o proximo cursor e e
 * descartada do resultado.
 *
 * O cursor sempre aponta para `id` (unico), mesmo quando o `orderBy` usado
 * por dentro de `find` e por outro campo (ex.: nome) — o Prisma localiza a
 * linha do cursor e continua a partir da posicao dela na ordenacao pedida,
 * entao isso funciona mesmo com orderBy composto.
 */
export async function paginateByCursor<T extends { id: string }>(
  query: CursorPageQuery,
  find: (args: { take: number; skip?: number; cursor?: { id: string } }) => Promise<T[]>,
): Promise<CursorPage<T>> {
  const rows = await find({
    take: query.limit + 1,
    ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}),
  });

  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  const last = items[items.length - 1];

  return { items, nextCursor: hasMore && last ? last.id : null };
}
