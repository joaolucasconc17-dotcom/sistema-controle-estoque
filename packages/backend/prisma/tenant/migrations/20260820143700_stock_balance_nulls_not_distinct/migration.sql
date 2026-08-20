-- Migration manual (nao gerada por `prisma migrate dev`).
--
-- O Prisma schema DSL nao tem como expressar "NULLS NOT DISTINCT" nem
-- indices parciais, entao esta constraint precisa ser escrita a mao.
--
-- Motivo: stock_balance.batchId e nulo para produtos sem rastreio de lote
-- (trackingMode = NONE). Uma UNIQUE constraint comum do Postgres trata cada
-- NULL como distinto dos demais — ou seja, o unique index padrao gerado
-- pelo Prisma para (productId, warehouseId, batchId) NAO impede duas linhas
-- de saldo para o MESMO produto+deposito quando batchId e nulo nas duas.
-- Isso duplicaria o saldo de qualquer produto sem lote.
--
-- Postgres 15+ resolve isso nativamente com NULLS NOT DISTINCT: passa a
-- tratar (productId, warehouseId, NULL) como colidindo consigo mesmo, que e
-- exatamente a semantica que StockLedgerService espera ao fazer upsert do
-- saldo.
DROP INDEX "stock_balance_productId_warehouseId_batchId_key";

CREATE UNIQUE INDEX "stock_balance_productId_warehouseId_batchId_key"
  ON "stock_balance" ("productId", "warehouseId", "batchId")
  NULLS NOT DISTINCT;
