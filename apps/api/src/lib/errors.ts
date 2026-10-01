export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST') => new HttpError(400, code, message);
export const unauthorized = (message = 'Please sign in again.') => new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Not allowed.') => new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (message: string, code = 'CONFLICT') => new HttpError(409, code, message);
export const tooMany = (message: string, retryAfterSeconds: number) => new HttpError(429, 'RATE_LIMITED', message, retryAfterSeconds);
