import { ArtifactValidator, type ValidationContext, fail, pass, warn } from './artifact-validator.js';

describe('ArtifactValidator', () => {
    const ctx: ValidationContext = {
        inputRaw: 'Test input',
        outputRaw: {},
        artifactType: 'test-suite',
    };

    it('validates with no invariants (empty)', () => {
        const validator = new ArtifactValidator('test-suite');
        const result = validator.validate({}, ctx);

        expect(result.allPassed).toBeTruthy();
        expect(result.totalInvariants).toBe(0);
    });

    it('runs a single invariant that passes', () => {
        const validator = new ArtifactValidator('test-suite');
        validator.addInvariant('T-01', () => [pass('T-01', 'OK')]);
        const result = validator.validate({}, ctx);

        expect(result.allPassed).toBeTruthy();
        expect(result.passed).toBe(1);
    });

    it('runs a single invariant that fails', () => {
        const validator = new ArtifactValidator('test-suite');
        validator.addInvariant('T-01', () => [fail('T-01', 'Failed')]);
        const result = validator.validate({}, ctx);

        expect(result.allPassed).toBeFalsy();
        expect(result.failed).toBe(1);
    });

    it('runs a warning-level invariant', () => {
        const validator = new ArtifactValidator('test-suite');
        validator.addInvariant('T-01', () => [warn('T-01', 'Warning')]);
        const result = validator.validate({}, ctx);

        expect(result.allPassed).toBeTruthy();
        expect(result.warnings).toBe(1);
    });

    it('runs multiple invariants', () => {
        const validator = new ArtifactValidator('test-suite');
        validator.addInvariant('T-01', () => [pass('T-01', 'Pass')]);
        validator.addInvariant('T-02', () => [fail('T-02', 'Fail')]);
        const result = validator.validate({}, ctx);

        expect(result.allPassed).toBeFalsy();
        expect(result.passed).toBe(1);
        expect(result.failed).toBe(1);
    });

    it('handles invariant that throws', () => {
        const validator = new ArtifactValidator('test-suite');
        validator.addInvariant('T-01', () => {
            throw new Error('Unexpected error');
        });
        const result = validator.validate({}, ctx);

        expect(result.allPassed).toBeFalsy();
        expect(result.failed).toBe(1);
    });

    it('prevents duplicate invariant registration', () => {
        const validator = new ArtifactValidator('test-suite');
        validator.addInvariant('T-01', () => [pass('T-01', '')]);

        expect(() => validator.addInvariant('T-01', () => [pass('T-01', '')])).toThrow(/./i);
    });

    it('reports hasInvariant correctly', () => {
        const validator = new ArtifactValidator('test-suite');
        validator.addInvariant('T-01', () => [pass('T-01', '')]);

        expect(validator.hasInvariant('T-01')).toBeTruthy();
        expect(validator.hasInvariant('T-02')).toBeFalsy();
    });

    it('lists registered invariants', () => {
        const validator = new ArtifactValidator('test-suite');
        validator.addInvariant('T-01', () => [pass('T-01', '')]);
        validator.addInvariant('T-02', () => [pass('T-02', '')]);
        const names = validator.listInvariants();

        expect(names).toContain('T-01');
        expect(names).toContain('T-02');
        expect(names).toHaveLength(2);
    });

    it('runs cross-field checks', () => {
        const validator = new ArtifactValidator('test-suite');
        validator.addCrossFieldCheck((artifact) => {
            const obj = artifact as Record<string, unknown>;
            if (obj['items_count'] !== undefined && Array.isArray(obj['items']) && obj['items_count'] !== obj['items'].length) {
                return [
                    fail(
                        'cross-field',
                        `items_count ${JSON.stringify(obj['items_count'])} !== items.length ${JSON.stringify(obj['items'].length)}`,
                    ),
                ];
            }
            return [pass('cross-field', 'OK')];
        });
        const result = validator.validate({ items_count: 5, items: [1, 2, 3] }, ctx);

        expect(result.allPassed).toBeFalsy();
    });

    it('catches cross-field check exceptions', () => {
        const validator = new ArtifactValidator('test-suite');
        validator.addCrossFieldCheck(() => {
            throw new Error('check error');
        });
        const result = validator.validate({}, ctx);

        expect(result.allPassed).toBeFalsy();
        expect(result.results.some((r) => r.message.toLowerCase().includes('cross-field'))).toBeTruthy();
    });

    it('validates with artifactType context', () => {
        const validator = new ArtifactValidator('bug-report');
        validator.addInvariant('B-01', (_artifact, context) => {
            if (context.artifactType === 'bug-report') return [pass('B-01', 'Correct type')];
            return [fail('B-01', 'Wrong type')];
        });
        const bugCtx = { ...ctx, artifactType: 'bug-report' as const };
        const result = validator.validate({}, bugCtx);

        expect(result.allPassed).toBeTruthy();
    });
});

describe('Factory functions', () => {
    it('pass builds passing result', () => {
        const r = pass('I-01', 'OK');

        expect(r.passed).toBeTruthy();
        expect(r.invariantId).toBe('I-01');
        expect(r.severity).toBe('error');
    });

    it('fail builds failing result', () => {
        const r = fail('T-01', 'Error', 'path');

        expect(r.passed).toBeFalsy();
        expect(r.severity).toBe('error');
        expect(r.artifactPath).toBe('path');
    });

    it('warn builds warning result', () => {
        const r = warn('T-02', 'Warning');

        expect(r.passed).toBeFalsy();
        expect(r.severity).toBe('warning');
    });
});
