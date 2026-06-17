/**
 * Property-Based Tests — Feature Config (FT-02)
 *
 * Invariantes do Zod schema FeatureConfigStoreSchema:
 * - Qualquer Record<string, ProjectFeatureConfig> passa no schema
 * - Qualquer entrada não-válida (não-objeto, tipos errados) é rejeitada
 * - skipAi/skipQuality/skipFlaky aceitam boolean | undefined
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FeatureConfigStoreSchema } from '../types/feature-config.js';

const GitProviderArb = fc.constantFrom('github', 'gitlab');
const PublishTargetArb = fc.constantFrom('github-actions', 'gitlab-ci', 's3', 'gh-pages', 'slack');

const PrReportFeatureConfigArb = fc.record({
    enabled: fc.boolean(),
    publishTarget: PublishTargetArb,
    jiraKey: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
    skipAi: fc.option(fc.boolean(), { nil: undefined }),
    skipQuality: fc.option(fc.boolean(), { nil: undefined }),
    skipFlaky: fc.option(fc.boolean(), { nil: undefined }),
});

const ProjectFeatureConfigArb = fc.record({
    gitProvider: GitProviderArb,
    repo: fc.option(fc.string({ minLength: 1, maxLength: 40 }), { nil: undefined }),
    jiraKey: fc.option(fc.string({ minLength: 0, maxLength: 20 }), { nil: undefined }),
    features: fc.record({
        prReport: fc.option(PrReportFeatureConfigArb, { nil: undefined }),
    }),
});

const ProjectKeyArb = fc.string({ minLength: 1, maxLength: 30 });

describe('FeatureConfigStoreSchema — property-based', () => {
    it('aceita qualquer Record<string, ProjectFeatureConfig> válido', () => {
        fc.assert(
            fc.property(fc.dictionary(ProjectKeyArb, ProjectFeatureConfigArb), (store) => {
                const result = FeatureConfigStoreSchema.safeParse(store);
                expect(result.success).toBe(true);
            }),
            { numRuns: 50 },
        );
    });

    it('rejeita não-objetos (string, number, null, array)', () => {
        fc.assert(
            fc.property(
                fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.array(fc.anything())),
                (invalid) => {
                    const result = FeatureConfigStoreSchema.safeParse(invalid);
                    expect(result.success).toBe(false);
                },
            ),
            { numRuns: 30 },
        );
    });

    it('rejeita valores com publishTarget inválido', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 30 }),
                fc.string().filter((s) => !['github-actions', 'gitlab-ci', 's3', 'gh-pages', 'slack'].includes(s)),
                (project, invalidTarget) => {
                    const store = {
                        [project]: {
                            gitProvider: 'github',
                            repo: 'test/test',
                            features: {
                                prReport: { enabled: true, publishTarget: invalidTarget },
                            },
                        },
                    };
                    const result = FeatureConfigStoreSchema.safeParse(store);
                    expect(result.success).toBe(false);
                },
            ),
            { numRuns: 30 },
        );
    });

    it('PrReportFeatureConfig skip flags aceitam boolean ou undefined', () => {
        fc.assert(
            fc.property(
                fc.option(fc.boolean(), { nil: undefined }),
                fc.option(fc.boolean(), { nil: undefined }),
                fc.option(fc.boolean(), { nil: undefined }),
                (skipAi, skipQuality, skipFlaky) => {
                    const config = {
                        enabled: true,
                        publishTarget: 'github-actions',
                        ...(skipAi !== undefined && { skipAi }),
                        ...(skipQuality !== undefined && { skipQuality }),
                        ...(skipFlaky !== undefined && { skipFlaky }),
                    };
                    const store = {
                        'test-project': {
                            gitProvider: 'github',
                            repo: 'test/test',
                            features: { prReport: config },
                        },
                    };
                    const result = FeatureConfigStoreSchema.safeParse(store);
                    expect(result.success).toBe(true);
                },
            ),
            { numRuns: 30 },
        );
    });
});
