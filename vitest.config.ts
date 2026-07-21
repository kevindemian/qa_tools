import { defineConfig } from 'vitest/config';
import VitestCtrfReporter from './shared/vitest-ctrf-reporter.js';
import { vitestAffected } from 'vitest-affected';

export default defineConfig({
    plugins: [
        vitestAffected({
            fullSuiteTriggers: ['**/__tests__/fixtures/**', '*.md'],
            staleCacheDays: 14,
            maxSelectiveRuns: 50,
            shadow: process.env.VITEST_AFFECTED_SHADOW === '1',
        }),
    ],
    test: {
        globals: true,
        environment: 'node',
        reporters: ['default', new VitestCtrfReporter()],
        setupFiles: [],
        // Em CI, os testes de integração e de LLM/IA (que dependem de redes
        // externas reais Xray/Jira/GitHub/LLM/DataHub) são separados — rodam
        // localmente com credenciais, mas não no gate de CI (evita
        // falsos-vermelhos por ausência de segredos). Não é silencing: o teste
        // continua existindo e é executado fora do CI. Correção de raiz
        // (hermetizar com nock/mock de LLM) está em aberto como tech-debt —
        // ver dev/docs/audit/test-quality-audit-2026-07-18.md §2/§3.
        exclude: process.env['CI']
            ? [
                  '**/node_modules/**',
                  '**/e2e/**',
                  '**/__tests__/integration/**',
                  // `**/*cloud*.test.ts` is retained ONLY for the subset that performs real
                  // external-network calls (Xray/Jira cloud) without mocking the fetch boundary.
                  // Tests that mock `global.fetch` (result_reporter-cloud, test-execution-creator-cloud)
                  // remain excluded by this pattern as tech-debt — they should be hermitized and
                  // re-included. See dev/docs/audit/test-quality-audit-2026-07-18.md §2/§3.
                  '**/*cloud*.test.ts',
                  '**/.stryker-tmp/**',
              ]
            : ['**/node_modules/**', '**/.stryker-tmp/**'],
        testTimeout: 15000,
        hookTimeout: 30000,
        teardownTimeout: 5000,
        coverage: {
            provider: 'v8',
            exclude: [
                '**/types/**',
                '**/types.ts',
                '**/__mocks__/**',
                '**/*.test.ts',
                '**/*.spec.ts',
                '**/index.ts',
                '**/*-validator.ts',
                '**/*-generator.ts',
                '**/e2e/**',
                'scripts/smartwizard-llm.ts',
                'scripts/smartwizard-discovery.ts',

                'shared/ui/prompt.ts',
                'shared/ui/prompt-input.ts',
                'shared/ui/prompt-ui.ts',
                'jira_management/import-prep.ts',
                'git_triggers/main.ts',
                'git_triggers/batch-mode.ts',
                'git_triggers/cli-args.ts',
                'git_triggers/interactive-mode.ts',
                'git_triggers/ui-helpers.ts',
                'git_triggers/session-state.ts',
                'git_triggers/import-loop.ts',
                'shared/session-context.ts',
                'scripts/coverage-registry.ts',
                // CLI entry-point binaries (same class as git_triggers/main.ts already excluded
                // above): standalone processes with dedicated test files under scripts/__tests__/.
                // The coverage gate measures library/business-logic; entry glue is out of scope.
                'scripts/validation-hook.ts',
            ],
            thresholds: {
                lines: 90,
                functions: 91,
                branches: 80,
                statements: 90,
            },
        },
    },
});
