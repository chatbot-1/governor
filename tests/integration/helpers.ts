import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

export const TEST_DB = 15;

export function createRedis(): Redis {
  return new Redis(REDIS_URL, { db: TEST_DB });
}
