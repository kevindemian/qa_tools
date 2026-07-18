import { formatErr } from '../errors.js';
/**
 * Generic artifact validation framework — Layer 2 (Domain Invariants).
 *
 * Architecture:
 * - `ArtifactValidator<T>` maintains a map of named invariant functions.
 * - Each invariant receives the artifact + ValidationContext and returns
 *   zero or more ValidationResults.
 * - Invariant IDs (e.g. "T-03", "I-01") are used for metrics tracking
 *   and targeted retry hints.
 * - `validateAll()` runs every registered invariant and collects results.
 * - Cross-field logical checks are registered as invariants internally.
 *
 * Usage:
 *   const validator = new ArtifactValidator<TestSuite>('test-suite');
 *   validator.addInvariant('T-01', myInvariantFn);
 *   validator.addCrossFieldCheck('items_count', (a) => ...);
 *   const results = validator.validate(artifact, context);
 */

export interface ValidationResult {
    passed: boolean;
    invariantId: string;
    message: string;
    severity: 'error' | 'warning';
    artifactPath: string;
}

export type ArtifactType = 'test-suite' | 'analysis' | 'bug-report' | 'comparison' | 'pipeline';

export interface ValidationContext {
    inputRaw: string;
    outputRaw: unknown;
    artifactType: ArtifactType;
}

export type InvariantFn<T = unknown> = (artifact: T, context: ValidationContext) => ValidationResult[];

export type CrossFieldCheck<T = unknown> = (artifact: T) => ValidationResult[];

export interface ValidatorSummary {
    totalInvariants: number;
    passed: number;
    failed: number;
    warnings: number;
    results: ValidationResult[];
    allPassed: boolean;
}

export class ArtifactValidator<T = unknown> {
    private readonly invariants: Map<string, InvariantFn<T>> = new Map();
    private readonly crossFieldChecks: CrossFieldCheck<T>[] = [];

    constructor(public readonly artifactType: ArtifactType) {}

    addInvariant(id: string, fn: InvariantFn<T>): void {
        if (this.invariants.has(id)) {
            throw new Error(`Invariant "${id}" is already registered for ${this.artifactType}`);
        }
        this.invariants.set(id, fn);
    }

    addCrossFieldCheck(check: CrossFieldCheck<T>): void {
        this.crossFieldChecks.push(check);
    }

    validate(artifact: T, context: ValidationContext): ValidatorSummary {
        const results: ValidationResult[] = [];

        for (const [id, fn] of this.invariants) {
            try {
                const invariantResults = fn(artifact, context);
                results.push(...invariantResults);
            } catch (err) {
                results.push({
                    passed: false,
                    invariantId: id,
                    message: `Invariant "${id}" threw: ${formatErr(err)}`,
                    severity: 'error',
                    artifactPath: '',
                });
            }
        }

        for (const check of this.crossFieldChecks) {
            try {
                const checkResults = check(artifact);
                results.push(...checkResults);
            } catch (err) {
                results.push({
                    passed: false,
                    invariantId: 'cross-field',
                    message: `Cross-field check threw: ${formatErr(err)}`,
                    severity: 'error',
                    artifactPath: '',
                });
            }
        }

        return this.summarize(results);
    }

    hasInvariant(id: string): boolean {
        return this.invariants.has(id);
    }

    listInvariants(): string[] {
        return Array.from(this.invariants.keys());
    }

    private summarize(results: ValidationResult[]): ValidatorSummary {
        const passed = results.filter((r) => r.passed).length;
        const failed = results.filter((r) => !r.passed && r.severity === 'error').length;
        const warnings = results.filter((r) => r.severity === 'warning' && !r.passed).length;

        return {
            totalInvariants: this.invariants.size + this.crossFieldChecks.length,
            passed,
            failed,
            warnings,
            results,
            allPassed: failed === 0,
        };
    }
}

/** Build a validation result for a passing invariant check. */
export function pass(invariantId: string, message: string): ValidationResult {
    return { passed: true, invariantId, message, severity: 'error', artifactPath: '' };
}

/** Build a validation result for a failing invariant check (error severity). */
export function fail(invariantId: string, message: string, artifactPath = ''): ValidationResult {
    return { passed: false, invariantId, message, severity: 'error', artifactPath };
}

/** Build a validation result for a warning-level invariant check. */
export function warn(invariantId: string, message: string, artifactPath = ''): ValidationResult {
    return { passed: false, invariantId, message, severity: 'warning', artifactPath };
}
