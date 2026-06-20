// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import security from 'eslint-plugin-security';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    security.configs.recommended,
    {
        languageOptions: {
            parserOptions: { project: './tsconfig.json' },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': ['error', { fixToUnknown: true }],
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/return-await': 'error',
            '@typescript-eslint/prefer-readonly': 'error',
            '@typescript-eslint/no-require-imports': 'error',
            'no-console': 'error',
            'no-throw-literal': 'error',
            'no-empty': ['error', { allowEmptyCatch: false }],
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-unnecessary-condition': 'error',
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',
            '@typescript-eslint/no-non-null-assertion': 'error',
            '@typescript-eslint/no-unsafe-assignment': 'error',
            '@typescript-eslint/no-unsafe-call': 'error',
            '@typescript-eslint/no-unsafe-member-access': 'error',
            '@typescript-eslint/no-unsafe-argument': 'error',
            '@typescript-eslint/no-unsafe-return': 'error',
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'CallExpression[callee.name="execSync"]',
                    message: 'Use execFileSync with argv array instead of execSync to prevent command injection.',
                },
                {
                    selector: 'CallExpression[callee.name="execFileSync"][arguments.0.type="TemplateLiteral"]',
                    message:
                        'execFileSync argument 0 must not be a template literal — use an argv array with literal command.',
                },
            ],
        },
    },
    // Layer restriction E5.1: shared/ must not import jira_management/ or git_triggers/
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
        files: ['**/*.ts'],
        ignores: ['shared/**', '**/*.test.ts', '**/*.test.js', 'e2e/**'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        { name: 'chalk', message: 'Use shared/palette instead of direct chalk import' },
                        { name: 'dotenv', message: 'Use shared/env-loader instead of direct dotenv import' },
                        {
                            name: 'readline-sync',
                            message: 'Use shared/readline or shared/deps instead of direct readline-sync',
                        },
                        { name: 'zod', message: 'Use shared/validation instead of direct zod import' },
                        { name: 'axios', message: 'Use shared/deps instead of direct axios import' },
                        { name: 'adm-zip', message: 'Use shared/deps instead of direct adm-zip import' },
                        { name: 'cli-progress', message: 'Use shared/deps instead of direct cli-progress import' },
                        { name: 'cli-table3', message: 'Use shared/deps instead of direct cli-table3 import' },
                        { name: 'csv-parser', message: 'Use shared/deps instead of direct csv-parser import' },
                        { name: 'figlet', message: 'Use shared/deps instead of direct figlet import' },
                        { name: 'glob', message: 'Use shared/deps instead of direct glob import' },
                        { name: 'yaml', message: 'Use shared/deps instead of direct yaml import' },
                    ],
                },
            ],
        },
    },
    {
        files: ['shared/test-utils.test.ts'],
        rules: { 'no-console': 'off' },
    },
    {
        files: ['shared/logger.ts', 'shared/logger.test.ts'],
        rules: { 'no-console': 'off' },
    },
    {
        ignores: [
            'node_modules/',
            'docs-archive/',
            'vitest.config.ts',
            'eslint.config.mjs',
            '**/*.js',
            '**/*.mjs',
            '.config/',
            '.opencode/',
        ],
    },
    prettier,
);
