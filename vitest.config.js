import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'scripts/__tests__/**/*.test.js',
      'tests/**/*.test.js',
    ],
  },
});
