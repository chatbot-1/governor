import { SlidingWindowCounter } from '../src';

describe('SlidingWindowCounter (local mode)', () => {
  it('allows requests up to the limit, then blocks the next one', async () => {
    const limiter = new SlidingWindowCounter({ limit: 3, windowMs: 1000 });

    expect((await limiter.isAllowed('user1')).allowed).toBe(true);
    expect((await limiter.isAllowed('user1')).allowed).toBe(true);
    expect((await limiter.isAllowed('user1')).allowed).toBe(true);
    expect((await limiter.isAllowed('user1')).allowed).toBe(false);
  });

  it('blends the previous window with a weight that shrinks over time', async () => {
    let clock = 0;
    const limiter = new SlidingWindowCounter({ limit: 10, windowMs: 1000, now: () => clock });

    for (let i = 0; i < 8; i++) {
      expect((await limiter.isAllowed('u')).allowed).toBe(true);
    }

    clock = 1000;
    expect((await limiter.isAllowed('u')).allowed).toBe(true);
    expect((await limiter.isAllowed('u')).allowed).toBe(true);
    expect((await limiter.isAllowed('u')).allowed).toBe(false);

    clock = 1500;
    expect((await limiter.isAllowed('u')).allowed).toBe(true);
  });

  it('forgets windows older than one full period', async () => {
    let clock = 0;
    const limiter = new SlidingWindowCounter({ limit: 3, windowMs: 1000, now: () => clock });

    await limiter.isAllowed('u');
    await limiter.isAllowed('u');
    await limiter.isAllowed('u');
    expect((await limiter.isAllowed('u')).allowed).toBe(false);

    clock = 3000;
    expect((await limiter.isAllowed('u')).allowed).toBe(true);
  });

  it('tracks each key independently', async () => {
    const limiter = new SlidingWindowCounter({ limit: 1, windowMs: 1000 });

    expect((await limiter.isAllowed('a')).allowed).toBe(true);
    expect((await limiter.isAllowed('a')).allowed).toBe(false);
    expect((await limiter.isAllowed('b')).allowed).toBe(true);
  });

  it('reports remaining capacity', async () => {
    const limiter = new SlidingWindowCounter({ limit: 5, windowMs: 1000 });

    expect((await limiter.isAllowed('u')).remaining).toBe(4);
    expect((await limiter.isAllowed('u')).remaining).toBe(3);
  });

  it('rejects invalid configuration', () => {
    expect(() => new SlidingWindowCounter({ limit: 0, windowMs: 1000 })).toThrow();
    expect(() => new SlidingWindowCounter({ limit: 3, windowMs: 0 })).toThrow();
  });
});
