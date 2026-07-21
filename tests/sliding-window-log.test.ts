import { SlidingWindowLog } from '../src';

describe('SlidingWindowLog (local mode)', () => {
  it('allows requests up to the limit, then blocks the next one', async () => {
    const limiter = new SlidingWindowLog({ limit: 3, windowMs: 1000 });

    expect((await limiter.isAllowed('user1')).allowed).toBe(true);
    expect((await limiter.isAllowed('user1')).allowed).toBe(true);
    expect((await limiter.isAllowed('user1')).allowed).toBe(true);
    expect((await limiter.isAllowed('user1')).allowed).toBe(false);
  });

  it('frees a slot only once the oldest request slides out of the window', async () => {
    let clock = 0;
    const limiter = new SlidingWindowLog({ limit: 3, windowMs: 1000, now: () => clock });

    clock = 0;
    await limiter.isAllowed('u');
    clock = 100;
    await limiter.isAllowed('u');
    clock = 200;
    await limiter.isAllowed('u');
    expect((await limiter.isAllowed('u')).allowed).toBe(false);

    clock = 999;
    expect((await limiter.isAllowed('u')).allowed).toBe(false);

    clock = 1000;
    expect((await limiter.isAllowed('u')).allowed).toBe(true);

    expect((await limiter.isAllowed('u')).allowed).toBe(false);
  });

  it('is immune to the fixed-window boundary trick', async () => {
    let clock = 0;

    const limiter = new SlidingWindowLog({ limit: 3, windowMs: 1000, now: () => clock });

    clock = 900;
    expect((await limiter.isAllowed('u')).allowed).toBe(true);
    expect((await limiter.isAllowed('u')).allowed).toBe(true);
    expect((await limiter.isAllowed('u')).allowed).toBe(true);

    clock = 1000;
    expect((await limiter.isAllowed('u')).allowed).toBe(false);
  });

  it('tracks each key independently', async () => {
    const limiter = new SlidingWindowLog({ limit: 1, windowMs: 1000 });

    expect((await limiter.isAllowed('a')).allowed).toBe(true);
    expect((await limiter.isAllowed('a')).allowed).toBe(false);
    expect((await limiter.isAllowed('b')).allowed).toBe(true);
  });

  it('reports remaining capacity', async () => {
    const limiter = new SlidingWindowLog({ limit: 5, windowMs: 1000 });

    expect((await limiter.isAllowed('u')).remaining).toBe(4);
    expect((await limiter.isAllowed('u')).remaining).toBe(3);
  });

  it('rejects invalid configuration', () => {
    expect(() => new SlidingWindowLog({ limit: 0, windowMs: 1000 })).toThrow();
    expect(() => new SlidingWindowLog({ limit: 3, windowMs: 0 })).toThrow();
  });
});
