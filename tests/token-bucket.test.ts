import { TokenBucket } from '../src';

describe('TokenBucket (local mode)', () => {
  it('allows requests up to the limit, then blocks the next one', async () => {
    const limiter = new TokenBucket({ limit: 3, windowMs: 1000 });

    expect((await limiter.isAllowed('user1')).allowed).toBe(true);
    expect((await limiter.isAllowed('user1')).allowed).toBe(true);
    expect((await limiter.isAllowed('user1')).allowed).toBe(true);
    expect((await limiter.isAllowed('user1')).allowed).toBe(false);
  });

  it('refills tokens as time passes', async () => {
    let clock = 0;

    const limiter = new TokenBucket({ limit: 3, windowMs: 3000, now: () => clock });

    await limiter.isAllowed('u');
    await limiter.isAllowed('u');
    await limiter.isAllowed('u');
    expect((await limiter.isAllowed('u')).allowed).toBe(false);

    clock += 1000;
    expect((await limiter.isAllowed('u')).allowed).toBe(true);
    expect((await limiter.isAllowed('u')).allowed).toBe(false);
  });

  it('tracks each key independently', async () => {
    const limiter = new TokenBucket({ limit: 1, windowMs: 1000 });

    expect((await limiter.isAllowed('a')).allowed).toBe(true);
    expect((await limiter.isAllowed('a')).allowed).toBe(false);

    expect((await limiter.isAllowed('b')).allowed).toBe(true);
  });

  it('reports remaining capacity', async () => {
    const limiter = new TokenBucket({ limit: 5, windowMs: 1000 });

    expect((await limiter.isAllowed('u')).remaining).toBe(4);
    expect((await limiter.isAllowed('u')).remaining).toBe(3);
  });

  it('rejects invalid configuration', () => {
    expect(() => new TokenBucket({ limit: 0, windowMs: 1000 })).toThrow();
    expect(() => new TokenBucket({ limit: 3, windowMs: 0 })).toThrow();
  });
});
