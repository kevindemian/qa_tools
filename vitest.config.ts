import { defineConfig } from 'vitest/config';
import VitestCtrfReporter from './shared/vitest-ctrf-reporter.js';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        reporters: ['default', new VitestCtrfReporter()],
        setupFiles: [],
        exclude: ['**/node_modules/**'],
        teardownTimeout: 5000,
        coverage: {
            provider: 'v8',
            thresholds: {
                lines: 90,
                functions: 91,
                branches: 80,
                statements: 90,
            },
        },
    },
});
