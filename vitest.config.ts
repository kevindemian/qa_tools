import { defineConfig } from 'vitest/config';
import VitestCtrfReporter from './shared/vitest-ctrf-reporter.js';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        reporters: ['default', new VitestCtrfReporter()],
        setupFiles: [],
        exclude: ['**/node_modules/**'],
        testTimeout: 15000,
        hookTimeout: 30000,
        teardownTimeout: 5000,
        coverage: {
            provider: 'v8',
            exclude: [
                '**/types/**',
                '**/types.ts',
                '**/__mocks__/**',
                '**/*.test.ts',
                '**/*.spec.ts',
                'scripts/smartwizard-llm.ts',
                'scripts/smartwizard-discovery.ts',
            ],
            thresholds: {
                lines: 90,
                functions: 91,
                branches: 80,
                statements: 90,
            },
        },
    },
});
