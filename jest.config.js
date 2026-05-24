/** @type {import('jest').Config} */
module.exports = {
    transform: { '^.+\\.ts$': 'ts-jest' },
    moduleFileExtensions: ['ts', 'js'],
    testMatch: ['**/*.test.ts', '**/*.test.js'],
    testTimeout: 30000,
    collectCoverageFrom: [
        'shared/**/*.ts',
        'jira_management/**/*.ts',
        'git_triggers/**/*.ts',
        '!**/*.test.ts',
        '!**/*.d.ts',
        '!**/node_modules/**',
        '!shared/types.ts',
    ],
    coverageThreshold: {
        global: {
            statements: 85,
            branches: 75,
            functions: 85,
            lines: 85,
        },
    },
};
