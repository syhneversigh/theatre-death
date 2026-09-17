export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message = code) { super(message); }
}
