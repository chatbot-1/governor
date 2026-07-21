import { RateLimiter } from './types';

export interface MinimalRequest {
  ip?: string;
}
export interface MinimalResponse {
  setHeader(name: string, value: string | number): void;
  status(code: number): MinimalResponse;
  send(body: string): void;
}
export type NextFunction = (err?: unknown) => void;

export interface ExpressRateLimitOptions {
  keyGenerator?: (req: MinimalRequest) => string;
  statusCode?: number;
  message?: string;
  failOpen?: boolean;
  now?: () => number;
}

export function expressRateLimit(limiter: RateLimiter, options: ExpressRateLimitOptions = {}) {
  const keyGenerator = options.keyGenerator ?? ((req: MinimalRequest) => req.ip ?? 'unknown');
  const statusCode = options.statusCode ?? 429;
  const message = options.message ?? 'Too Many Requests';
  const failOpen = options.failOpen ?? true;
  const now = options.now ?? (() => Date.now());

  return async function rateLimitMiddleware(
    req: MinimalRequest,
    res: MinimalResponse,
    next: NextFunction,
  ): Promise<void> {
    let result;
    try {
      result = await limiter.isAllowed(keyGenerator(req));
    } catch (err) {
      if (failOpen) return next();
      return next(err);
    }

    res.setHeader('X-RateLimit-Remaining', Math.max(0, result.remaining));
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      const retryAfterSec = Math.max(0, Math.ceil((result.resetAt - now()) / 1000));
      res.setHeader('Retry-After', retryAfterSec);
      res.status(statusCode).send(message);
      return;
    }

    next();
  };
}
