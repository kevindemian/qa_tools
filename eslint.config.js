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
            'no-empty': ['error', { allowEmptyCatch: false }],
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
        },
    },
    // Layer restriction E5.1: shared/ must not import jira_management/ or git_triggers/
    // allowTypeImports — type-only imports are erased at compile time, zero runtime coupling
    {
        files: ['shared/**/*.ts', 'shared/**/*.js'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: [
                                '../jira_management',
                                '../jira_management/*',
                                '../git_triggers',
                                '../git_triggers/*',
                            ],
                            message:
                                'Layer violation [E5.1]: shared/ must not import from jira_management/ or git_triggers/',
                        },
                    ],
                },
            ],
        },
    },
    // Layer restriction E5.1: jira_management/ must not import git_triggers/
    {
        files: ['jira_management/**/*.ts', 'jira_management/**/*.js'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: [
                                '../git_triggers',
                                '../git_triggers/*',
                                '../../git_triggers',
                                '../../git_triggers/*',
                            ],
                            message: 'Layer violation [E5.1]: jira_management/ must not import from git_triggers/',
                        },
                    ],
                },
            ],
        },
    },
    {
        files: [
            'shared/prompt.ts',
            'shared/logger.ts',
            'shared/splash.ts',
            'jira_management/ui-helpers.ts',
            'docs/**/*.ts',
            'jira_management/main.ts',
            'git_triggers/main.ts',
        ],
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
            'no-empty': 'off',
        },
    },
    {
        files: ['e2e/**/*.ts'],
        rules: {
            'no-console': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-unnecessary-type-assertion': 'off',
            'no-restricted-imports': 'off',
        },
    },
    { ignores: ['node_modules/', 'docs-archive/', '**/*.js'] },
    prettier,
);
