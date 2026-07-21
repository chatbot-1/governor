import express from 'express';
import { TokenBucket, expressRateLimit } from '../../src';

const app = express();

const limiter = new TokenBucket({ limit: 5, windowMs: 10_000 });

app.use(expressRateLimit(limiter));

app.get('/', (_req, res) => {
  res.send('OK — you are within the rate limit.\n');
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`Example API on http://localhost:${PORT}  (limit: 5 requests / 10s per IP)`);
  console.log('Hit it repeatedly to receive a 429 with a Retry-After header.');
});
