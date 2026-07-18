import { defineConfig } from 'vitest/config';
import VitestCtrfReporter from './shared/vitest-ctrf-reporter.js';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        reporters: ['default', new VitestCtrfReporter()],
        setupFiles: [],
        // Em CI, os testes de integração (que dependem de redes externas reais
        // Xray/Jira/GitHub/LLM/DatHub) são separados — rodam localmente com
        // credenciais, mas não no gate de CI (evita falsos-vermelhos por ausência
        // de segredos). Não é silencing: o teste continua existindo e é executado
        // fora do CI. Correção de raiz (hermetizar com nock) está em aberto como
        // tech-debt — ver dev/docs/audit/test-quality-audit-2026-07-18.md §2/§3.
        exclude: process.env['CI']
            ? [
                  '**/node_modules/**',
                  '**/e2e/**',
                  '**/*cloud*.test.ts',
                  '**/__tests__/integration/**',
                  '**/llm-fallback*.test.ts',
              ]
            : ['**/node_modules/**'],
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
