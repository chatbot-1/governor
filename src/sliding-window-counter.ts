import { RateLimiter, RateLimitResult, RateLimiterOptions } from './types';

interface Counter {
  windowIndex: number;
  currentCount: number;
  previousCount: number;
}

export class SlidingWindowCounter implements RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly counters = new Map<string, Counter>();

  constructor(options: RateLimiterOptions) {
    if (options.limit <= 0) throw new Error('limit must be > 0');
    if (options.windowMs <= 0) throw new Error('windowMs must be > 0');

    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.now = options.now ?? (() => Date.now());
  }

  async isAllowed(key: string): Promise<RateLimitResult> {
    const now = this.now();
    const windowIndex = Math.floor(now / this.windowMs);
    const windowStart = windowIndex * this.windowMs;

    let counter = this.counters.get(key);
    if (!counter) {
      counter = { windowIndex, currentCount: 0, previousCount: 0 };
      this.counters.set(key, counter);
    } else if (counter.windowIndex !== windowIndex) {
      if (windowIndex - counter.windowIndex === 1) {
        counter.previousCount = counter.currentCount;
        counter.currentCount = 0;
      } else {
        counter.previousCount = 0;
        counter.currentCount = 0;
      }
      counter.windowIndex = windowIndex;
    }

    const elapsed = now - windowStart;
    const weight = (this.windowMs - elapsed) / this.windowMs;
    const estimate = counter.currentCount + counter.previousCount * weight;

    let allowed = false;
    if (estimate < this.limit) {
      counter.currentCount += 1;
      allowed = true;
    }

    const projected = estimate + (allowed ? 1 : 0);
    const remaining = Math.max(0, Math.floor(this.limit - projected));

    const resetAt = windowStart + this.windowMs;

    return { allowed, remaining, resetAt };
  }
}
