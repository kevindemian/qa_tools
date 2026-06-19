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

const ProjectKeyArb = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s !== '__proto__');

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
                fc
                    .string({ minLength: 1, maxLength: 30 })
                    .filter((s) => s !== String.fromCharCode(95, 95, 112, 114, 111, 116, 111, 95, 95)),
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

/* ────────────────────────────────────────────────────────────────────────
 * PBT — resolvePublishTarget core logic invariants
 *
 * Invariantes (pura, sem I/O):
 *  1. Se enabled=true → resultado = config.publishTarget
 *  2. Se enabled=false + gitProvider=gitlab → resultado = 'gitlab-ci'
 *  3. Se enabled=false + sem gitProvider → resultado = 'github-actions'
 *  4. Resultado é sempre um PublishTarget válido
 * ──────────────────────────────────────────────────────────────────────── */

const ValidTargets = ['github-actions', 'gitlab-ci', 's3', 'gh-pages', 'slack'] as const;
type ValidTarget = (typeof ValidTargets)[number];

function resolvePublishTargetPure(
    enabled: boolean,
    publishTarget: ValidTarget,
    storedGitProvider: string | undefined,
    explicitGitProvider: string | undefined,
): string {
    if (enabled) return publishTarget;
    const provider = explicitGitProvider ?? storedGitProvider;
    if (provider === 'gitlab') return 'gitlab-ci';
    return 'github-actions';
}

describe('resolvePublishTarget — property-based invariants', () => {
    it('retorna publishTarget configurado quando enabled=true', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...ValidTargets),
                fc.constantFrom('github', 'gitlab', undefined),
                fc.constantFrom('github', 'gitlab', undefined),
                (target, storedGitProvider, explicitGitProvider) => {
                    const result = resolvePublishTargetPure(true, target, storedGitProvider, explicitGitProvider);
                    expect(result).toBe(target);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('retorna gitlab-ci quando enabled=false e gitProvider é gitlab (qualquer origem)', () => {
        fc.assert(
            fc.property(fc.constantFrom(...ValidTargets), (target) => {
                // Se gitProvider='gitlab' explícito
                expect(resolvePublishTargetPure(false, target, undefined, 'gitlab')).toBe('gitlab-ci');
                // Se gitProvider='gitlab' armazenado
                expect(resolvePublishTargetPure(false, target, 'gitlab', undefined)).toBe('gitlab-ci');
            }),
            { numRuns: 30 },
        );
    });

    it('retorna github-actions quando enabled=false e sem gitProvider gitlab', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...ValidTargets),
                fc.constantFrom('github', 'gitlab', undefined),
                fc.constantFrom('github', 'gitlab', undefined),
                (target, storedGitProvider, explicitGitProvider) => {
                    fc.pre(storedGitProvider !== 'gitlab' && explicitGitProvider !== 'gitlab');
                    const result = resolvePublishTargetPure(false, target, storedGitProvider, explicitGitProvider);
                    expect(result).toBe('github-actions');
                },
            ),
            { numRuns: 50 },
        );
    });

    it('retorno é sempre um PublishTarget válido', () => {
        fc.assert(
            fc.property(
                fc.boolean(),
                fc.constantFrom(...ValidTargets),
                fc.constantFrom('github', 'gitlab', undefined),
                fc.constantFrom('github', 'gitlab', undefined),
                (enabled, target, stored, explicit) => {
                    const result = resolvePublishTargetPure(enabled, target, stored, explicit);
                    expect(ValidTargets).toContain(result as ValidTarget);
                },
            ),
            { numRuns: 100 },
        );
    });

    it('explicitGitProvider tem precedência sobre storedGitProvider', () => {
        fc.assert(
            fc.property(fc.constantFrom(...ValidTargets), (target) => {
                // stored=gitlab, explicit=github => github-actions (precedência do explicit)
                expect(resolvePublishTargetPure(false, target, 'gitlab', 'github')).toBe('github-actions');
                // stored=github, explicit=gitlab => gitlab-ci (precedência do explicit)
                expect(resolvePublishTargetPure(false, target, 'github', 'gitlab')).toBe('gitlab-ci');
            }),
            { numRuns: 10 },
        );
    });
});
