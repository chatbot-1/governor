import type { Redis } from 'ioredis';
import { RateLimiter, RateLimitResult } from './types';
import { RedisRateLimiterOptions } from './redis-types';

const SLIDING_LOG_LUA = `
local key      = KEYS[1]
local now      = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit    = tonumber(ARGV[3])
local ttl      = tonumber(ARGV[4])
local member   = ARGV[5]

local windowStart = now - windowMs

redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

local count = redis.call('ZCARD', key)
local allowed = 0
if count < limit then
  redis.call('ZADD', key, now, member)
  allowed = 1
  count = count + 1
end

redis.call('PEXPIRE', key, ttl)

local remaining = limit - count
if remaining < 0 then remaining = 0 end

local resetAt
if count > 0 then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  resetAt = tonumber(oldest[2]) + windowMs
else
  resetAt = now + windowMs
end

return { allowed, remaining, resetAt }
`;

type RedisWithSlidingLog = Redis & {
  governorSlidingLog(
    key: string,
    now: number,
    windowMs: number,
    limit: number,
    ttl: number,
    member: string,
  ): Promise<[number, number, number]>;
};

export class RedisSlidingWindowLog implements RateLimiter {
  private readonly redis: RedisWithSlidingLog;
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly keyPrefix: string;
  private readonly now: () => number;
  private seq = 0;

  constructor(options: RedisRateLimiterOptions) {
    if (options.limit <= 0) throw new Error('limit must be > 0');
    if (options.windowMs <= 0) throw new Error('windowMs must be > 0');

    this.redis = options.redis as RedisWithSlidingLog;
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.keyPrefix = options.keyPrefix ?? 'governor:swl:';
    this.now = options.now ?? (() => Date.now());

    if (typeof this.redis.governorSlidingLog !== 'function') {
      this.redis.defineCommand('governorSlidingLog', {
        numberOfKeys: 1,
        lua: SLIDING_LOG_LUA,
      });
    }
  }

  async isAllowed(key: string): Promise<RateLimitResult> {
    const now = this.now();
    const redisKey = this.keyPrefix + key;

    const member = `${now}-${this.seq++}-${Math.random().toString(36).slice(2)}`;

    const [allowed, remaining, resetAt] = await this.redis.governorSlidingLog(
      redisKey,
      now,
      this.windowMs,
      this.limit,
      this.windowMs,
      member,
    );

    return { allowed: allowed === 1, remaining, resetAt };
  }
}
