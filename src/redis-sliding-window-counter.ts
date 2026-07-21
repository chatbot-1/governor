import type { Redis } from 'ioredis';
import { RateLimiter, RateLimitResult } from './types';
import { RedisRateLimiterOptions } from './redis-types';

const SLIDING_COUNTER_LUA = `
local key      = KEYS[1]
local now      = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit    = tonumber(ARGV[3])
local ttl      = tonumber(ARGV[4])

local windowIndex = math.floor(now / windowMs)
local windowStart = windowIndex * windowMs

local data        = redis.call('HMGET', key, 'windowIndex', 'current', 'previous')
local storedIndex = tonumber(data[1])
local current     = tonumber(data[2])
local previous    = tonumber(data[3])

if storedIndex == nil then
  storedIndex = windowIndex
  current = 0
  previous = 0
elseif storedIndex ~= windowIndex then
  if windowIndex - storedIndex == 1 then
    previous = current
    current = 0
  else
    previous = 0
    current = 0
  end
  storedIndex = windowIndex
end

local elapsed  = now - windowStart
local weight   = (windowMs - elapsed) / windowMs
local estimate = current + previous * weight

local allowed = 0
if estimate < limit then
  current = current + 1
  allowed = 1
end

redis.call('HSET', key, 'windowIndex', storedIndex, 'current', current, 'previous', previous)
redis.call('PEXPIRE', key, ttl)

local projected = estimate + allowed
local remaining = math.floor(limit - projected)
if remaining < 0 then remaining = 0 end

local resetAt = windowStart + windowMs
return { allowed, remaining, resetAt }
`;

type RedisWithSlidingCounter = Redis & {
  governorSlidingCounter(
    key: string,
    now: number,
    windowMs: number,
    limit: number,
    ttl: number,
  ): Promise<[number, number, number]>;
};

export class RedisSlidingWindowCounter implements RateLimiter {
  private readonly redis: RedisWithSlidingCounter;
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly keyPrefix: string;
  private readonly now: () => number;

  constructor(options: RedisRateLimiterOptions) {
    if (options.limit <= 0) throw new Error('limit must be > 0');
    if (options.windowMs <= 0) throw new Error('windowMs must be > 0');

    this.redis = options.redis as RedisWithSlidingCounter;
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.keyPrefix = options.keyPrefix ?? 'governor:swc:';
    this.now = options.now ?? (() => Date.now());

    if (typeof this.redis.governorSlidingCounter !== 'function') {
      this.redis.defineCommand('governorSlidingCounter', {
        numberOfKeys: 1,
        lua: SLIDING_COUNTER_LUA,
      });
    }
  }

  async isAllowed(key: string): Promise<RateLimitResult> {
    const now = this.now();
    const redisKey = this.keyPrefix + key;

    const ttl = this.windowMs * 2;

    const [allowed, remaining, resetAt] = await this.redis.governorSlidingCounter(
      redisKey,
      now,
      this.windowMs,
      this.limit,
      ttl,
    );

    return { allowed: allowed === 1, remaining, resetAt };
  }
}
