import type { InvariantFn, ValidationContext, ValidationResult } from '../artifact-validator.js';
import { pass, fail, warn } from '../artifact-validator.js';

export const invariantCoverageThreshold: InvariantFn = (
    artifact: unknown,
    _context: ValidationContext,
): ValidationResult[] => {
    if (typeof artifact !== 'object' || artifact === null) return [fail('T-02', 'Artifact is not an object')];

    const obj = artifact as Record<string, unknown>;
    if (Array.isArray(obj)) return [pass('T-02', 'Array artifact has no coverage table — skipping')];

    const coverageTable = obj['coverageTable'] as Record<string, unknown> | undefined;
    if (!coverageTable) return [warn('T-02', 'No coverageTable found in artifact')];

    const coverage = coverageTable['coverage'] as number | undefined;
    if (coverage === undefined || coverage < 0) return [fail('T-02', 'coverageTable.coverage must be a valid number')];

    if (coverage >= 90) return [pass('T-02', `Coverage is ${coverage}% — meets threshold`)];
    const gaps = coverageTable['gaps'] as Array<Record<string, unknown>> | undefined;
    if (!gaps || gaps.length === 0) {
        return [fail('T-02', `Coverage is ${coverage}% (< 90%) but no gaps array with reasons provided`)];
    }
    const missingReasons = gaps.filter(
        (g) => !g['reason'] || typeof g['reason'] !== 'string' || g['reason'].trim() === '',
    );
    if (missingReasons.length > 0) {
        return [fail('T-02', `Coverage is ${coverage}% but ${missingReasons.length} gap(s) missing reason`)];
    }
    return [pass('T-02', `Coverage is ${coverage}% with ${gaps.length} justified gap(s)`)];
};
