import type { Redis } from 'ioredis';
import { RateLimiter, RateLimitResult } from './types';
import { RedisRateLimiterOptions } from './redis-types';

const TOKEN_BUCKET_LUA = `
local key         = KEYS[1]
local capacity    = tonumber(ARGV[1])
local refillPerMs = tonumber(ARGV[2])
local now         = tonumber(ARGV[3])
local requested   = tonumber(ARGV[4])
local ttl         = tonumber(ARGV[5])

local data       = redis.call('HMGET', key, 'tokens', 'lastRefill')
local tokens     = tonumber(data[1])
local lastRefill = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  lastRefill = now
end

local elapsed = now - lastRefill
if elapsed > 0 then
  tokens = math.min(capacity, tokens + elapsed * refillPerMs)
  lastRefill = now
end

local allowed = 0
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
end

redis.call('HSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
redis.call('PEXPIRE', key, ttl)

local tokensToFull = capacity - tokens
local resetAfterMs = math.ceil(tokensToFull / refillPerMs)

return { allowed, math.floor(tokens), now + resetAfterMs }
`;

type RedisWithTokenBucket = Redis & {
  governorTokenBucket(
    key: string,
    capacity: number,
    refillPerMs: number,
    now: number,
    requested: number,
    ttl: number,
  ): Promise<[number, number, number]>;
};

export class RedisTokenBucket implements RateLimiter {
  private readonly redis: RedisWithTokenBucket;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly windowMs: number;
  private readonly keyPrefix: string;
  private readonly now: () => number;

  constructor(options: RedisRateLimiterOptions) {
    if (options.limit <= 0) throw new Error('limit must be > 0');
    if (options.windowMs <= 0) throw new Error('windowMs must be > 0');

    this.redis = options.redis as RedisWithTokenBucket;
    this.capacity = options.limit;
    this.refillPerMs = options.limit / options.windowMs;
    this.windowMs = options.windowMs;
    this.keyPrefix = options.keyPrefix ?? 'governor:tb:';
    this.now = options.now ?? (() => Date.now());

    if (typeof this.redis.governorTokenBucket !== 'function') {
      this.redis.defineCommand('governorTokenBucket', {
        numberOfKeys: 1,
        lua: TOKEN_BUCKET_LUA,
      });
    }
  }

  async isAllowed(key: string): Promise<RateLimitResult> {
    const now = this.now();
    const redisKey = this.keyPrefix + key;

    const [allowed, remaining, resetAt] = await this.redis.governorTokenBucket(
      redisKey,
      this.capacity,
      this.refillPerMs,
      now,
      1,
      this.windowMs,
    );

    return { allowed: allowed === 1, remaining, resetAt };
  }
}
