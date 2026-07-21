import { RateLimiter, RateLimitResult, RateLimiterOptions } from './types';

export class SlidingWindowLog implements RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly logs = new Map<string, number[]>();

  constructor(options: RateLimiterOptions) {
    if (options.limit <= 0) throw new Error('limit must be > 0');
    if (options.windowMs <= 0) throw new Error('windowMs must be > 0');

    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.now = options.now ?? (() => Date.now());
  }

  async isAllowed(key: string): Promise<RateLimitResult> {
    const now = this.now();
    const windowStart = now - this.windowMs;

    let log = this.logs.get(key);
    if (!log) {
      log = [];
      this.logs.set(key, log);
    }

    while (log.length > 0 && log[0] <= windowStart) {
      log.shift();
    }

    let allowed = false;
    if (log.length < this.limit) {
      log.push(now);
      allowed = true;
    }

    const remaining = Math.max(0, this.limit - log.length);

    const resetAt = log.length > 0 ? log[0] + this.windowMs : now + this.windowMs;

    return { allowed, remaining, resetAt };
  }
}
