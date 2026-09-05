import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './vitest.global-setup.ts',
    setupFiles: './vitest.setup.ts',
    pool: 'threads',
    coverage: {
      provider: 'v8'
    },
    // the JUnit report is for CI only; without an `outputFile` the reporter
    // writes its XML to stdout, which buries the results of a local run
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: './test-results/junit.xml' }
  }
});
