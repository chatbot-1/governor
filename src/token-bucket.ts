import { RateLimiter, RateLimitResult, RateLimiterOptions } from './types';

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class TokenBucket implements RateLimiter {
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly now: () => number;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: RateLimiterOptions) {
    if (options.limit <= 0) throw new Error('limit must be > 0');
    if (options.windowMs <= 0) throw new Error('windowMs must be > 0');

    this.capacity = options.limit;
    this.refillPerMs = options.limit / options.windowMs;
    this.now = options.now ?? (() => Date.now());
  }

  async isAllowed(key: string): Promise<RateLimitResult> {
    const now = this.now();

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    const elapsed = now - bucket.lastRefill;
    if (elapsed > 0) {
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerMs);
      bucket.lastRefill = now;
    }

    let allowed = false;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      allowed = true;
    }

    const remaining = Math.floor(bucket.tokens);

    const tokensToFull = this.capacity - bucket.tokens;
    const resetAt = now + Math.ceil(tokensToFull / this.refillPerMs);

    return { allowed, remaining, resetAt };
  }
}
