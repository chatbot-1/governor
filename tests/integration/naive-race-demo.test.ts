import Redis from 'ioredis';
import { RedisTokenBucket } from '../../src';
import { createRedis } from './helpers';

class NaiveRedisTokenBucket {
  constructor(
    private readonly redis: Redis,
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly keyPrefix = 'naive:tb:',
  ) {}

  async isAllowed(key: string): Promise<{ allowed: boolean }> {
    const now = Date.now();
    const redisKey = this.keyPrefix + key;
    const refillPerMs = this.limit / this.windowMs;

    const data = await this.redis.hmget(redisKey, 'tokens', 'lastRefill');
    let tokens = data[0] === null ? this.limit : parseFloat(data[0]);
    let lastRefill = data[1] === null ? now : parseFloat(data[1]);

    const elapsed = now - lastRefill;
    if (elapsed > 0) {
      tokens = Math.min(this.limit, tokens + elapsed * refillPerMs);
      lastRefill = now;
    }

    let allowed = false;
    if (tokens >= 1) {
      tokens -= 1;
      allowed = true;
    }

    await this.redis.hset(redisKey, 'tokens', tokens, 'lastRefill', lastRefill);
    await this.redis.pexpire(redisKey, this.windowMs);

    return { allowed };
  }
}

const LIMIT = 100;
const CONCURRENT = 500;
const INSTANCES = 8;

describe('Race condition demonstration [integration]', () => {
  it('NAIVE get-then-set OVERCOUNTS under concurrency', async () => {
    const connections = Array.from({ length: INSTANCES }, () => createRedis());
    await connections[0].flushall();
    const servers = connections.map((c) => new NaiveRedisTokenBucket(c, LIMIT, 60_000));

    try {
      const results = await Promise.all(
        Array.from({ length: CONCURRENT }, (_, i) => servers[i % INSTANCES].isAllowed('victim')),
      );
      const allowed = results.filter((r) => r.allowed).length;

      console.log(
        `\n  NAIVE limiter allowed ${allowed} / ${CONCURRENT} (limit was ${LIMIT}) <- LEAK\n`,
      );
      expect(allowed).toBeGreaterThan(LIMIT);
    } finally {
      await Promise.all(connections.map((c) => c.quit()));
    }
  });

  it('ATOMIC Lua holds EXACTLY at the limit under the same load', async () => {
    const connections = Array.from({ length: INSTANCES }, () => createRedis());
    await connections[0].flushall();
    const servers = connections.map(
      (c) => new RedisTokenBucket({ redis: c, limit: LIMIT, windowMs: 60_000 }),
    );

    try {
      const results = await Promise.all(
        Array.from({ length: CONCURRENT }, (_, i) => servers[i % INSTANCES].isAllowed('victim')),
      );
      const allowed = results.filter((r) => r.allowed).length;

      console.log(
        `\n  ATOMIC limiter allowed ${allowed} / ${CONCURRENT} (limit was ${LIMIT}) <- correct\n`,
      );
      expect(allowed).toBe(LIMIT);
    } finally {
      await Promise.all(connections.map((c) => c.quit()));
    }
  });
});
