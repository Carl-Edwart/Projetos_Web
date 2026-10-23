export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function badRequest(code: string, message: string, fields?: Record<string, string>): AppError {
  return new AppError(400, code, message, fields);
}

export function forbidden(code = "FORBIDDEN", message = "Não foi possível validar esta solicitação."): AppError {
  return new AppError(403, code, message);
}

export function notFound(code = "NOT_FOUND", message = "Não encontramos este pedido."): AppError {
  return new AppError(404, code, message);
}

export function conflict(code: string, message: string): AppError {
  return new AppError(409, code, message);
}

export function unavailable(code: string, message: string): AppError {
  return new AppError(503, code, message);
}
