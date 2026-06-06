import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        setupFiles: [],
        exclude: ['**/node_modules/**'],
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
