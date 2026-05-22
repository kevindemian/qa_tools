// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const prettier = require('eslint-config-prettier');

module.exports = tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: { project: './tsconfig.json' },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': ['error', { fixToUnknown: true }],
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/return-await': 'error',
            '@typescript-eslint/prefer-readonly': 'warn',
            'no-console': 'error',
            'no-throw-literal': 'error',
            'no-empty': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
        },
    },
    {
        files: ['shared/prompt.ts', 'shared/logger.ts'],
        rules: {
            'no-console': 'off',
        },
    },
    {
        files: ['**/*.test.ts', '**/*.test.js', '**/__tests__/**'],
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-unused-expressions': 'off',
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/unbound-method': 'off',
            '@typescript-eslint/require-await': 'off',
            'no-console': 'off',
            'no-control-regex': 'off',
        },
    },
    { ignores: ['node_modules/', '**/*.js', 'e2e/'] },
    prettier,
);
