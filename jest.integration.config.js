/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Only the integration tests, which require a live Redis at REDIS_URL
  // (default redis://127.0.0.1:6379).
  testMatch: ['**/tests/integration/**/*.test.ts'],
};
