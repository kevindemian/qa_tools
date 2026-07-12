// @ts-check
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import security from 'eslint-plugin-security';
import promise from 'eslint-plugin-promise';
import vitest from '@vitest/eslint-plugin';
import sonarjs from 'eslint-plugin-sonarjs';
import unusedImports from 'eslint-plugin-unused-imports';
import localResult from './scripts/eslint-plugins/result-catraca.cjs';

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig(
    // Global: set tsconfigRootDir to avoid ambiguity with .opencode/guard/backups/tsconfig.json
    {
        languageOptions: {
            parserOptions: {
                tsconfigRootDir,
            },
        },
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    security.configs.recommended,
    promise.configs['flat/recommended'],
    sonarjs.configs.recommended,
    {
        files: [
            '**/*.test.ts',
            '**/*.spec.ts',
            '**/*.test.tsx',
            '**/*.spec.tsx',
            'tests/**/*.{ts,tsx}',
            '__tests__/**/*.{ts,tsx}',
        ],
        plugins: { vitest },
        languageOptions: {
            globals: {
                suite: 'readonly',
                test: 'readonly',
                describe: 'readonly',
                it: 'readonly',
                expect: 'readonly',
                assert: 'readonly',
                vi: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                onTestFailed: 'readonly',
                onTestFinished: 'readonly',
            },
        },
        rules: {
            'vitest/expect-expect': [
                'error',
                {
                    assertFunctionNames: ['expect', 'testingLibrary.*.findBy*', 'supertest.*.expect'],
                },
            ],
            'vitest/valid-expect': [
                'error',
                {
                    alwaysAwait: true,
                    asyncMatchers: ['resolves', 'rejects'],
                    minArgs: 1,
                    maxArgs: 1,
                },
            ],
            'vitest/valid-title': [
                'error',
                {
                    mustNotMatch: {
                        it: ['^should', 'Evite começar com "should"'],
                        test: ['^should', 'Evite começar com "should"'],
                    },
                    mustMatch: {
                        describe: ['^[A-Z]', 'Describe deve começar com maiúscula'],
                    },
                },
            ],
            'vitest/no-focused-tests': 'error',
            'vitest/no-disabled-tests': 'error',
            'vitest/no-identical-title': 'error',
            'vitest/no-standalone-expect': 'error',
            'vitest/no-conditional-expect': 'error',
            'vitest/no-conditional-tests': 'error',
            'vitest/no-import-node-test': 'error',
            'vitest/no-test-return-statement': 'error',
            'vitest/no-test-prefixes': 'error',
            'vitest/no-alias-methods': 'error',
            'vitest/no-duplicate-hooks': 'error',
            'vitest/require-to-throw-message': 'error',
            'vitest/prefer-strict-equal': 'error',
            'vitest/require-local-test-context-for-concurrent-snapshots': 'error',
            'vitest/prefer-hooks-on-top': 'error',
            'vitest/prefer-hooks-in-order': 'error',
            'vitest/require-top-level-describe': 'error',
            'vitest/prefer-lowercase-title': [
                'error',
                {
                    ignore: ['describe'],
                    allowedPrefixes: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                },
            ],
            'vitest/prefer-to-be': 'error',
            'vitest/prefer-to-be-truthy': 'error',
            'vitest/prefer-to-be-falsy': 'error',
            'vitest/prefer-to-contain': 'error',
            'vitest/prefer-to-have-length': 'error',
            'vitest/prefer-comparison-matcher': 'error',
            'vitest/prefer-equality-matcher': 'error',
            'vitest/prefer-called-with': 'error',
            'vitest/prefer-vi-mocked': 'error',
            'vitest/prefer-mock-promise-shorthand': 'error',
            'vitest/prefer-each': 'error',
            'vitest/prefer-expect-assertions': [
                'error',
                {
                    onlyFunctionsWithAsyncKeyword: true,
                    onlyFunctionsWithExpectInLoop: true,
                    onlyFunctionsWithExpectInCallback: true,
                },
            ],
            'vitest/prefer-expect-resolves': 'error',
            'vitest/prefer-todo': 'error',
            'vitest/max-expects': ['error', { max: 8 }],
            'vitest/max-nested-describe': ['error', { max: 3 }],
            'vitest/no-large-snapshots': [
                'error',
                {
                    maxSize: 50,
                    inlineMaxSize: 20,
                    allowedSnapshots: {},
                },
            ],
            'vitest/prefer-snapshot-hint': ['error', 'always'],
            'vitest/consistent-test-it': [
                'error',
                {
                    fn: 'it',
                    withinDescribe: 'it',
                },
            ],
            'vitest/padding-around-all': 'error',
            'vitest/no-restricted-matchers': [
                'error',
                {
                    toMatchSnapshot: 'Use toMatchInlineSnapshot para revisão no PR',
                    toThrowErrorMatchingSnapshot: 'Use versão inline',
                },
            ],
            'vitest/no-restricted-vi-methods': [
                'error',
                {
                    advanceTimersByTime: 'Use vi.advanceTimersByTimeAsync para async',
                },
            ],
        },
    },
    {
        languageOptions: {
            parserOptions: {
                project: './tsconfig.json',
                tsconfigRootDir,
            },
        },
        plugins: {
            'unused-imports': unusedImports,
            'local-result': localResult,
        },
        rules: {
            'prefer-const': 'error',
            'no-var': 'error',
            '@typescript-eslint/no-explicit-any': ['error', { fixToUnknown: true }],
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            'unused-imports/no-unused-imports': 'error',
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
            // Catraca (turnstile): obriga tratamento de Result (port de Rust #[must_use]).
            // Só morde valores do tipo neverthrow.Result, logo é zero-falso-positivo em código legado.
            'local-result/must-use-result': 'error',
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
                {
                    selector: 'MemberExpression[property.name="loadMetricsStore"]',
                    message:
                        'SSOT violation: loadMetricsStore is internal to DataHub. Use DataHub.computed.* or DataHub.raw.* instead.',
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
        ignores: [
            'node_modules/',
            'docs-archive/',
            'vitest.config.ts',
            'eslint.config.mjs',
            '**/*.js',
            '**/*.mjs',
            '.config/',
            '.opencode/',
            '.tmp/',
            '.shared/',
            'scripts/validation-hook.ts',
        ],
    },
    prettier,
);
