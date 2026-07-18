import { describe, it, expect } from 'vitest';
import {
    getSchemaForType,
    getTypeReviewChecks,
    buildReviewPrompt,
    buildSelfCritiquePrompt,
    buildAdversarialRetryPrompt,
    buildRetryPrompt,
} from '../llm/llm-review-prompts.js';
import type { ArtifactType } from '../llm/llm-review-types.js';
import { TestSuiteSchema } from '../validation/test-suite.schema.js';
import { FailureAnalysisSchema } from '../validation/failure-analysis.schema.js';
import { PipelineClassificationSchema } from '../validation/pipeline-schema.js';
import { AiBugReportSchema } from '../validation/bug-report.schema.js';
import { RunComparisonSchema } from '../validation/comparison-schema.js';

const TYPES: ArtifactType[] = ['test-suite', 'analysis', 'bug-report', 'comparison', 'pipeline'];

describe('LlmReviewPrompts', () => {
    describe('GetSchemaForType', () => {
        it.each(TYPES)('returns the matching Zod schema for "%s"', (type) => {
            expect.assertions(1);

            const schema = getSchemaForType(type);

            const expected = {
                'test-suite': TestSuiteSchema,
                analysis: FailureAnalysisSchema,
                pipeline: PipelineClassificationSchema,
                'bug-report': AiBugReportSchema,
                comparison: RunComparisonSchema,
            }[type];

            expect(schema).toBe(expected);
        });
    });

    describe('GetTypeReviewChecks', () => {
        it.each(TYPES)('returns a non-empty, type-specific check list for "%s"', (type) => {
            expect.assertions(1);

            expect(getTypeReviewChecks(type).length).toBeGreaterThan(0);
        });

        it('returns a distinct check list per artifact type', () => {
            expect.assertions(1);

            const all = TYPES.map((t) => getTypeReviewChecks(t));
            const unique = new Set(all);

            expect(unique.size).toBe(TYPES.length);
        });
    });

    describe('BuildReviewPrompt', () => {
        it.each(TYPES)(
            'includes the artifact type, the non-compliance premise, and the original input for "%s"',
            (type) => {
                expect.assertions(3);

                const original = 'SAMPLE ARTIFACT BODY 12345';
                const prompt = buildReviewPrompt(original, type);

                expect(prompt).toContain(type);
                expect(prompt).toContain('PREMISE OF NON-COMPLIANCE');
                expect(prompt).toContain(original);
            },
        );

        it.each(TYPES)('exposes the type-specific checks in the built prompt for "%s"', (type) => {
            expect.assertions(1);

            const prompt = buildReviewPrompt('body', type);

            expect(prompt).toContain(getTypeReviewChecks(type));
        });
    });

    describe('BuildSelfCritiquePrompt', () => {
        it.each(TYPES)('frames an independent auditor and embeds the original input for "%s"', (type) => {
            expect.assertions(3);

            const original = 'SELF CRITIQUE BODY 67890';
            const prompt = buildSelfCritiquePrompt(original, type);

            expect(prompt).toContain('independent adversarial auditor');
            expect(prompt).toContain(type);
            expect(prompt).toContain(original);
        });

        it('uses the independent-auditor persona wording (distinct from buildReviewPrompt)', () => {
            expect.assertions(2);

            const selfCritique = buildSelfCritiquePrompt('x', 'analysis');
            const review = buildReviewPrompt('x', 'analysis');

            expect(selfCritique).toContain('DIFFERENT agent from the report generator');
            expect(selfCritique).not.toBe(review);
        });
    });

    describe('BuildAdversarialRetryPrompt', () => {
        it.each(TYPES)('injects the peer-review gaps, the original context, and the type for "%s"', (type) => {
            expect.assertions(3);

            const gaps = 'GAP LINE A\nGAP LINE B';
            const user = 'USER CONTEXT 24680';
            const prompt = buildAdversarialRetryPrompt(gaps, user, type);

            expect(prompt).toContain(gaps);
            expect(prompt).toContain(user);
            expect(prompt).toContain(type);
        });
    });

    describe('BuildRetryPrompt', () => {
        it('lists every validation error and the original instruction', () => {
            expect.assertions(3);

            const errors = ['error one', 'error two'];
            const original = 'ORIGINAL INSTRUCTION 13579';
            const prompt = buildRetryPrompt(original, errors);

            expect(prompt).toContain('error one');
            expect(prompt).toContain('error two');
            expect(prompt).toContain(original);
        });

        it('appends the invalid response (sanitized: credentials in URLs redacted) when provided', () => {
            expect.assertions(3);

            const invalid = 'see https://user:pass@host.example/internal/run/42 for detail';
            const prompt = buildRetryPrompt('instructions', ['bad'], invalid);

            expect(prompt).toContain('YOUR INVALID RESPONSE');
            expect(prompt).toContain('user:[...sanitized]');
            expect(prompt).not.toContain('pass@host');
        });

        it('omits the invalid-response section when no invalidResponse is supplied', () => {
            expect.assertions(1);

            const prompt = buildRetryPrompt('instructions', ['bad']);

            expect(prompt).not.toContain('YOUR INVALID RESPONSE');
        });
    });
});
