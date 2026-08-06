import { describe, it, expect } from 'vitest';
import { validateBucketCoverage, MUTATION_BUCKETS, listBucketNames } from '../mutation-buckets.js';

describe('Bucket coverage validation (Estratégia B — Rule 25, sem gap silencioso)', () => {
    it('aprova a partição canônica quando todo arquivo-fonte está em exatamente um bucket', () => {
        expect.hasAssertions();

        const files = [
            'shared/data-hub/compute/hub.ts',
            'shared/report/generator.ts',
            'shared/quality/gate.ts',
            'shared/validation/validator.ts',
            'shared/ui/prompt.ts',
            'shared/primitives/date-utils.ts',
            'shared/llm/classify.ts',
            'shared/test-utils/helpers.ts',
            'shared/invariants/rule.ts',
            'shared/ci/ci-status.ts',
            'shared/infra/logger.ts',
            'shared/types/domain.ts',
            'shared/constants/paths.ts',
            'shared/jira/client.ts',
            'shared/prompts/prompt.md',
            'shared/migration/migrate.ts',
            'shared/__mocks__/logger.ts',
            'shared/date-utils.ts',
            'jira_management/xray-client.ts',
            'jira_management/commands/import.ts',
            'jira_management/__mocks__/xray.ts',
            'git_triggers/main.ts',
        ];

        expect(validateBucketCoverage(files)).toBeTruthy();
    });

    it('ignora testes, declarações .d.ts e arquivos fora do MUTATE_DIRS', () => {
        expect.hasAssertions();

        const files = [
            'shared/__tests__/date-utils.test.ts',
            'shared/types.d.ts',
            'vitest.config.ts',
            'scripts/mutation-scope.ts',
            'docs/readme.md',
        ];

        expect(validateBucketCoverage(files)).toBeTruthy();
    });

    it('falha com gap quando um diretório novo não está em nenhum bucket', () => {
        expect.hasAssertions();

        const files = ['shared/data-hub/hub.ts', 'shared/future-module/engine.ts'];

        expect(() => validateBucketCoverage(files)).toThrow(/Uncovered source files/);
    });

    it('falha com overlap quando um arquivo é capturado por dois buckets', () => {
        expect.hasAssertions();

        const brokenPartition = [
            { name: 'a', specs: ['shared/'] },
            { name: 'b', specs: ['shared/data-hub'] },
        ];
        const files = ['shared/data-hub/hub.ts'];

        expect(() => validateBucketCoverage(files, brokenPartition)).toThrow(/Overlaps/);
    });

    it('expõe nomes de buckets únicos para o matrix do CI', () => {
        expect.hasAssertions();

        const names = listBucketNames();

        expect(new Set(names).size).toBe(names.length);
        expect(names.length).toBeGreaterThan(0);
        expect(MUTATION_BUCKETS.every((bucket) => bucket.specs.length > 0)).toBeTruthy();
    });
});
