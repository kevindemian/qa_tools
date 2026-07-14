/**
 * Reporter registry — data-driven mapping of reporter identifiers/packages
 * to their report format. Replaces the previous regex `REPORTER_PATTERNS`.
 *
 * Both the isolate executor and the AST extractor return raw reporter
 * identifiers (e.g. 'ctrf-json-reporter', '@d2t/vitest-ctrf',
 * 'VitestCtrfReporter' via import). `matchReporter` resolves them to a known
 * format so detection is extensible without hard-coded regex.
 */

export type ReporterFormat = 'ctrf' | 'junit' | 'mochawesome' | 'unknown';

export interface ReporterRegistryEntry {
    format: ReporterFormat;
    label: string;
}

export const REPORTER_REGISTRY: Record<string, ReporterRegistryEntry> = {
    ctrf: { format: 'ctrf', label: 'CTRF' },
    'vitest-ctrf': { format: 'ctrf', label: 'CTRF' },
    '@d2t/vitest-ctrf': { format: 'ctrf', label: 'CTRF' },
    'ctrf-json': { format: 'ctrf', label: 'CTRF' },
    'ctrf-json-reporter': { format: 'ctrf', label: 'CTRF' },
    junit: { format: 'junit', label: 'JUnit' },
    'vitest-junit': { format: 'junit', label: 'JUnit' },
    '@d2t/vitest-junit': { format: 'junit', label: 'JUnit' },
    'jest-junit': { format: 'junit', label: 'JUnit' },
    'jest-junit-reporter': { format: 'junit', label: 'JUnit' },
    mochawesome: { format: 'mochawesome', label: 'Mochawesome' },
};

/**
 * Resolve a raw reporter identifier to a known format, or null if unknown.
 *
 * Matching is exact (registry key) OR the identifier *contains* a registry
 * key as a substring (e.g. `VitestCtrfReporter` ⊃ `ctrf`,
 * `@d2t/vitest-ctrf-json-reporter` ⊃ `ctrf-json-reporter`).
 *
 * The reverse direction (`key.includes(identifier)`) is intentionally NOT used:
 * it caused framework names like `vitest`/`jest` to falsely match reporter
 * keys (`vitest-ctrf`/`jest-junit`), producing false positives in the
 * package.json dependency scan. Every realistic identifier is either an exact
 * key or contains a key, so dropping the reverse direction loses no coverage.
 */
export function matchReporter(name: string): ReporterRegistryEntry | null {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    if (REPORTER_REGISTRY[n]) return REPORTER_REGISTRY[n] ?? null;
    for (const key of Object.keys(REPORTER_REGISTRY)) {
        if (n.includes(key)) return REPORTER_REGISTRY[key] ?? null;
    }
    return null;
}

/** True if any of the given raw reporter identifiers maps to a known format. */
export function matchesAnyReporter(names: string[]): boolean {
    return names.some((name) => matchReporter(name) !== null);
}
