import Redis from 'ioredis';
import { RedisSlidingWindowCounter } from '../../src';
import { createRedis } from './helpers';

describe('RedisSlidingWindowCounter (distributed mode) [integration]', () => {
  let redis: Redis;

  beforeAll(() => {
    redis = createRedis();
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  it('allows up to `limit` requests, then blocks (sequential)', async () => {
    const limiter = new RedisSlidingWindowCounter({ redis, limit: 5, windowMs: 60_000 });
    const key = 'user:sequential';

    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if ((await limiter.isAllowed(key)).allowed) allowed++;
    }

    expect(allowed).toBe(5);
  });

  it('does NOT overcount under heavy concurrency', async () => {
    const LIMIT = 100;
    const CONCURRENT = 500;
    const INSTANCES = 8;
    const key = 'user:concurrent';

    const connections = Array.from({ length: INSTANCES }, () => createRedis());
    const servers = connections.map(
      (conn) => new RedisSlidingWindowCounter({ redis: conn, limit: LIMIT, windowMs: 60_000 }),
    );

    try {
      const results = await Promise.all(
        Array.from({ length: CONCURRENT }, (_, i) => servers[i % INSTANCES].isAllowed(key)),
      );
      const allowedCount = results.filter((r) => r.allowed).length;
      expect(allowedCount).toBe(LIMIT);
    } finally {
      await Promise.all(connections.map((c) => c.quit()));
    }
  });
});
