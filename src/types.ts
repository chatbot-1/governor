export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimiter {
  isAllowed(key: string): Promise<RateLimitResult>;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
}
