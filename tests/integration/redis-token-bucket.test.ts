import Redis from 'ioredis';
import { RedisTokenBucket } from '../../src';
import { createRedis } from './helpers';

describe('RedisTokenBucket (distributed mode) [integration]', () => {
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

  it('allows exactly `limit` requests, then blocks (sequential)', async () => {
    const limiter = new RedisTokenBucket({ redis, limit: 5, windowMs: 60_000 });
    const key = 'user:sequential';

    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if ((await limiter.isAllowed(key)).allowed) allowed++;
    }

    expect(allowed).toBe(5);
  });

  it('shares one bucket across multiple limiter instances', async () => {
    const serverA = new RedisTokenBucket({ redis, limit: 3, windowMs: 60_000 });
    const serverB = new RedisTokenBucket({ redis, limit: 3, windowMs: 60_000 });
    const key = 'user:shared';

    expect((await serverA.isAllowed(key)).allowed).toBe(true);
    expect((await serverB.isAllowed(key)).allowed).toBe(true);
    expect((await serverA.isAllowed(key)).allowed).toBe(true);

    expect((await serverB.isAllowed(key)).allowed).toBe(false);
  });

  it('does NOT overcount under heavy concurrency (the race-condition proof)', async () => {
    const LIMIT = 100;
    const CONCURRENT = 500;
    const INSTANCES = 8;
    const key = 'user:concurrent';

    const connections = Array.from({ length: INSTANCES }, () => createRedis());
    const servers = connections.map(
      (conn) => new RedisTokenBucket({ redis: conn, limit: LIMIT, windowMs: 60_000 }),
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
