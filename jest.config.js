/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  // Integration tests need a live Redis; they run via `npm run test:redis`.
  testPathIgnorePatterns: ['/node_modules/', '/tests/integration/'],
};
