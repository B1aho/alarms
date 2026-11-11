import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'test',
  testMatch: ['e2e/**/*.spec.js', 'visual/**/*.spec.js'],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: { trace: 'off' },
})
