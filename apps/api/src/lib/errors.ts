export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number = 400,
    public readonly isOperational = true
  ) {
    super(message);
    this.name = "AppError";
  }
}

// Safe error serializer — never leak stack traces or internal details to clients
export function toSafeError(
  err: unknown,
  isDev: boolean
): { error: string; code?: string } {
  if (err instanceof AppError) return { error: err.message, code: err.code };
  if (isDev && err instanceof Error) return { error: err.message };
  return { error: "An unexpected error occurred" };
}
