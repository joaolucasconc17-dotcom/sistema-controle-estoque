import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import type { ApiErrorBody } from "@estoque/shared";
import { AppError } from "../errors.js";
import { logger } from "../logger.js";

export function errorHandler(
  error: FastifyError | AppError | ZodError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error({ err: error, reqId: request.id }, "erro interno");
    }
    const body: ApiErrorBody = {
      error: { code: error.code, message: error.message, details: error.details },
    };
    reply.status(error.statusCode).send(body);
    return;
  }

  if (error instanceof ZodError) {
    const body: ApiErrorBody = {
      error: { code: "VALIDATION_FAILED", message: "Dados invalidos", details: error.flatten() },
    };
    reply.status(400).send(body);
    return;
  }

  // Erros de validacao de schema do proprio Fastify (rotas com `schema:`)
  if ("validation" in error && error.validation) {
    const body: ApiErrorBody = {
      error: { code: "VALIDATION_FAILED", message: error.message, details: error.validation },
    };
    reply.status(400).send(body);
    return;
  }

  // Outros erros nativos do Fastify (ex.: FST_ERR_CTP_EMPTY_JSON_BODY,
  // payload malformado, limite de tamanho) ja vem com statusCode proprio —
  // respeitar em vez de mascarar tudo como 500. So o que realmente nao tem
  // statusCode conhecido cai no 500 generico abaixo.
  if ("statusCode" in error && typeof error.statusCode === "number" && error.statusCode < 500) {
    const body: ApiErrorBody = {
      error: { code: "VALIDATION_FAILED", message: error.message },
    };
    reply.status(error.statusCode).send(body);
    return;
  }

  logger.error({ err: error, reqId: request.id }, "erro nao tratado");
  const body: ApiErrorBody = {
    error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor" },
  };
  reply.status(500).send(body);
}
