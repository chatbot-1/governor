import type { Redis } from 'ioredis';

export interface RedisRateLimiterOptions {
  redis: Redis;
  limit: number;
  windowMs: number;
  keyPrefix?: string;
  now?: () => number;
}
