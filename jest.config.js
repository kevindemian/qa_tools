/* * @type {import('jest').Config} */
module.exports = {
    transform: { '^.+\\.ts$': 'ts-jest' },
    moduleFileExtensions: ['ts', 'js'],
    testMatch: ['**/*.test.ts', '**/*.test.js'],
    testTimeout: 30000,
};
