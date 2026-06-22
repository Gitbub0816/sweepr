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
): { error: string; detail?: string } {
  if (err instanceof AppError) return { error: err.message };
  if (err instanceof Error) return { error: "An unexpected error occurred", detail: err.message };
  return { error: "An unexpected error occurred", detail: String(err) };
}
