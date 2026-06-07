// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
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
            '@typescript-eslint/no-require-imports': 'off',
            'no-console': 'error',
            'no-throw-literal': 'error',
            'no-empty': ['error', { allowEmptyCatch: false }],
            '@typescript-eslint/no-floating-promises': 'error',
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
            'git_triggers/cli-args.ts',
            'git_triggers/cli-dispatch.ts',
            'git_triggers/interactive-mode.ts',
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
            '@typescript-eslint/unbound-method': 'off',
            '@typescript-eslint/require-await': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unnecessary-type-assertion': 'off',
            '@typescript-eslint/await-thenable': 'off',
            '@typescript-eslint/no-redundant-type-constituents': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            'no-console': 'off',
            'no-control-regex': 'off',
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
    {
        files: ['shared/__mocks__/**', 'shared/test-utils/factories/**'],
        rules: {
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        },
    },
    // DepWall — must import through shared/deps, shared/palette, shared/validation,
    // shared/env-loader, or shared/readline instead of direct npm packages
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
        ignores: [
            'node_modules/',
            'docs-archive/',
            'scripts/',
            'vitest.config.ts',
            'eslint.config.mjs',
            '**/*.js',
            '.config/',
        ],
    },
    prettier,
);
