import { describe, it, expect } from 'vitest';
import { ARTIFACT_SPECS, ADDITIONAL_ARTIFACT_SPECS } from '../types/artifact-specs.js';
import type { ArtifactSpec } from '../types/artifact-specs.js';

const ALL_SPECS: ArtifactSpec[] = [...ARTIFACT_SPECS, ...ADDITIONAL_ARTIFACT_SPECS];

describe('R8.1 Mandatory Metrics Validation', () => {
    it('all artifacts have metrics defined', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(spec.metrics.length).toBeGreaterThan(0);
        }
    });

    it('all metrics have name, source, format, severity', () => {
        expect.hasAssertions();

        const formats = ['number', 'percentage', 'currency', 'duration', 'badge', 'grade', 'datetime'];
        const severities = ['error', 'warn', 'info', 'success', 'default'];
        for (const spec of ALL_SPECS) {
            for (const metric of spec.metrics) {
                expect(metric.name.length).toBeGreaterThan(0);
                expect(metric.source.length).toBeGreaterThan(0);
                expect(formats).toContain(metric.format);
                expect(severities).toContain(metric.severity);
            }
        }
    });

    it('all metrics with thresholdOperator have valid value', () => {
        expect.hasAssertions();

        const operators = ['>=', '<=', '>', '<', '='];
        for (const spec of ALL_SPECS) {
            for (const metric of spec.metrics) {
                const op = metric.thresholdOperator ?? '>=';

                expect(operators).toContain(op);
            }
        }
    });

    it('all artifacts have ssot defined', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(spec.ssot.length).toBeGreaterThan(0);
        }
    });

    it('all artifacts have file defined', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(spec.file.length).toBeGreaterThan(0);
        }
    });
});

describe('R8.2 Mandatory Sections Validation', () => {
    it('all artifacts have sections defined', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(spec.sections.length).toBeGreaterThan(0);
        }
    });

    it('all sections have name and type', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            for (const section of spec.sections) {
                expect(section.name.length).toBeGreaterThan(0);
                expect(section.type.length).toBeGreaterThan(0);
            }
        }
    });
});

describe('R8.3 Conditional Actions Validation', () => {
    it('all artifacts with actions have condition and message', () => {
        expect.hasAssertions();

        const severities = ['error', 'warn', 'info'];
        for (const spec of ALL_SPECS) {
            for (const action of spec.actions) {
                expect(action.condition.length).toBeGreaterThan(0);
                expect(action.message.length).toBeGreaterThan(0);
                expect(severities).toContain(action.severity);
            }
        }
    });
});

describe('R8.4 Thresholds and Severities Validation', () => {
    it('all metrics with threshold have valid numeric value', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            for (const metric of spec.metrics) {
                const threshold = metric.threshold ?? 0;

                expect(Number.isFinite(threshold)).toBeTruthy();
            }
        }
    });

    it('all metrics with sampleSizeWarning have valid value', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            for (const metric of spec.metrics) {
                const warning = metric.sampleSizeWarning ?? 0;

                expect(warning).toBeGreaterThanOrEqual(0);
            }
        }
    });
});

describe('R8.5 Timestamp and SSOT Validation', () => {
    it('all artifacts have timestamp boolean', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(typeof spec.timestamp).toBe('boolean');
        }
    });

    it('all artifacts have sampleSizeWarning boolean', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(typeof spec.sampleSizeWarning).toBe('boolean');
        }
    });

    it('all artifacts have purpose and auditor', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(spec.purpose.length).toBeGreaterThan(0);
            expect(spec.auditor.length).toBeGreaterThan(0);
        }
    });

    it('all artifacts have reference', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(spec.reference.length).toBeGreaterThan(0);
        }
    });
});

describe('R8 Cross-cutting Validation', () => {
    it('all artifact IDs are unique', () => {
        expect.hasAssertions();

        const ids = ALL_SPECS.map((s) => s.id);

        expect(new Set(ids).size).toBe(ids.length);
    });

    it('all artifact IDs are kebab-case', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            expect(/^[a-z]+(-[a-z]+)*$/.test(spec.id)).toBeTruthy();
        }
    });

    it('total artifact count is at least 21', () => {
        expect.hasAssertions();
        expect(ALL_SPECS.length).toBeGreaterThanOrEqual(21);
    });

    it('all metrics have description', () => {
        expect.hasAssertions();

        for (const spec of ALL_SPECS) {
            for (const metric of spec.metrics) {
                expect(metric.description.length).toBeGreaterThan(0);
            }
        }
    });
});
