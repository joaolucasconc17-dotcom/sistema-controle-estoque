import { ERROR_CODES, type ErrorCode } from "@estoque/shared";

/**
 * Erro de aplicacao com codigo estavel + status HTTP. O errorHandler do
 * Fastify (ver http/errorHandler.ts) converte isso na forma ApiErrorBody
 * compartilhada com o frontend.
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }

  static validation(message: string, details?: unknown) {
    return new AppError(ERROR_CODES.VALIDATION_FAILED, message, 400, details);
  }
  static unauthorized(message = "Nao autenticado") {
    return new AppError(ERROR_CODES.UNAUTHORIZED, message, 401);
  }
  static forbidden(message = "Sem permissao para esta operacao") {
    return new AppError(ERROR_CODES.FORBIDDEN, message, 403);
  }
  static notFound(message = "Recurso nao encontrado") {
    return new AppError(ERROR_CODES.NOT_FOUND, message, 404);
  }
  static conflict(message: string, details?: unknown) {
    return new AppError(ERROR_CODES.CONFLICT, message, 409, details);
  }
  static insufficientStock(message = "Saldo insuficiente para esta operacao") {
    return new AppError(ERROR_CODES.INSUFFICIENT_STOCK, message, 409);
  }
  static duplicateIdempotencyKey(message = "Operacao ja processada") {
    return new AppError(ERROR_CODES.DUPLICATE_IDEMPOTENCY_KEY, message, 409);
  }
  static tenantNotFound(message = "Empresa nao encontrada") {
    return new AppError(ERROR_CODES.TENANT_NOT_FOUND, message, 404);
  }
  static tenantSuspended(message = "Empresa suspensa") {
    return new AppError(ERROR_CODES.TENANT_SUSPENDED, message, 403);
  }
  static internal(message = "Erro interno") {
    return new AppError(ERROR_CODES.INTERNAL_ERROR, message, 500);
  }
}
