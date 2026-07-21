import {
  TokenBucket,
  SlidingWindowLog,
  SlidingWindowCounter,
  RateLimiter,
  RateLimiterOptions,
} from '../src';

interface Algo {
  name: string;
  make: (opts: RateLimiterOptions) => RateLimiter;
}

const ALGOS: Algo[] = [
  { name: 'Token Bucket', make: (o) => new TokenBucket(o) },
  { name: 'Sliding Window Log', make: (o) => new SlidingWindowLog(o) },
  { name: 'Sliding Window Counter', make: (o) => new SlidingWindowCounter(o) },
];

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const pad = (s: string, n: number) => s.padEnd(n);

async function benchThroughput() {
  const ITER = 200_000;
  const KEYS = 1_000;
  const rows: { name: string; opsPerSec: number }[] = [];

  console.log('\n1. THROUGHPUT (evaluations per second, single thread)');
  for (const { name, make } of ALGOS) {
    const limiter = make({ limit: 1_000_000, windowMs: 60_000 });
    for (let i = 0; i < 10_000; i++) await limiter.isAllowed('k' + (i % KEYS));

    const start = process.hrtime.bigint();
    for (let i = 0; i < ITER; i++) await limiter.isAllowed('k' + (i % KEYS));
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;

    const opsPerSec = ITER / seconds;
    rows.push({ name, opsPerSec });
    console.log(`   ${pad(name, 24)} ${fmt(opsPerSec).padStart(12)} ops/sec`);
  }
  return rows;
}

function gcHard() {
  global.gc?.();
  global.gc?.();
}

async function benchMemory() {
  const KEYS = 10_000;
  const FILL = 100;
  const rows: { name: string; bytes: number }[] = [];

  console.log(`\n2. MEMORY (${fmt(KEYS)} keys x ${FILL} requests each, retained heap)`);
  if (!global.gc) console.log('   (run with --expose-gc for accurate numbers)');

  const keep: RateLimiter[] = [];
  gcHard();
  const baseline = process.memoryUsage().heapUsed;

  for (const { name, make } of ALGOS) {
    const limiter = make({ limit: FILL, windowMs: 3_600_000 });
    keep.push(limiter);
    for (let k = 0; k < KEYS; k++) {
      const key = 'user' + k;
      for (let r = 0; r < FILL; r++) await limiter.isAllowed(key);
    }

    gcHard();
    const bytes = process.memoryUsage().heapUsed - baseline;
    rows.push({ name, bytes });
    console.log(`   ${pad(name, 24)} ${(bytes / 1024 / 1024).toFixed(1).padStart(7)} MB`);

    keep.pop();
    gcHard();
  }

  if (keep.length !== 0) console.log('   (warning: structures still retained)');
  return rows;
}

async function benchAccuracy() {
  const limit = 100;
  const windowMs = 1_000;
  const WINDOWS = 10;
  const attemptsPerMs = 2;
  const rows: { name: string; perWindow: number }[] = [];

  console.log(
    `\n3. ACCURACY (configured limit = ${limit}/window, saturated over ${WINDOWS} windows)`,
  );
  for (const { name, make } of ALGOS) {
    let clock = 0;
    const limiter = make({ limit, windowMs, now: () => clock });

    let allowed = 0;
    for (clock = 0; clock < windowMs * WINDOWS; clock++) {
      for (let a = 0; a < attemptsPerMs; a++) {
        if ((await limiter.isAllowed('u')).allowed) allowed++;
      }
    }

    const perWindow = allowed / WINDOWS;
    rows.push({ name, perWindow });
    console.log(
      `   ${pad(name, 24)} ${perWindow.toFixed(1).padStart(7)} allowed/window  (target ${limit})`,
    );
  }
  return rows;
}

async function main() {
  console.log('='.repeat(60));
  console.log('  Governor benchmarks (local mode)  —  Node ' + process.version);
  console.log('='.repeat(60));

  const throughput = await benchThroughput();
  const memory = await benchMemory();
  const accuracy = await benchAccuracy();

  console.log('\n\nMARKDOWN TABLE (for README):\n');
  console.log(
    '| Algorithm | Throughput (ops/sec) | Memory (10K keys) | Accuracy (allowed/window, target 100) |',
  );
  console.log('|---|---|---|---|');
  for (let i = 0; i < ALGOS.length; i++) {
    const name = ALGOS[i].name;
    const t = fmt(throughput[i].opsPerSec);
    const m = (memory[i].bytes / 1024 / 1024).toFixed(1) + ' MB';
    const a = accuracy[i].perWindow.toFixed(1);
    console.log(`| ${name} | ${t} | ${m} | ${a} |`);
  }
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
