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
        'setup/**/*.ts',
        'scripts/**/*.ts',
        '!**/*.test.ts',
        '!**/*.d.ts',
        '!**/node_modules/**',
        '!e2e/**',
        '!shared/__mocks__/**',
        '!shared/prompts/__fixtures__/**',
    ],
    coverageThreshold: {
        global: {
            statements: 90,
            branches: 80,
            functions: 91,
            lines: 90,
        },
    },
};
