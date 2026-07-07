/**
 * Framework Detection — shared logic.
 *
 * Provides:
 * - `isManifestFile()` — single source of truth for manifest file detection
 * - `detectFrameworkFromDeps()` — pure function, shared between local (setup/) and remote (API) detection
 * - `detectFrameworkFromAPI()` — uses GitProvider to read package.json via Contents API
 */
import type { GitProvider, FrameworkDetectionResult } from './types/ci-cd.js';
import { humanizeError } from './prompt-errors.js';
import { rootLogger } from './logger.js';

const MANIFEST_PATTERN =
    /(^|\/)(package\.json|requirements\.txt|pyproject\.toml|Gemfile$|pom\.xml|go\.mod|Cargo\.toml|composer\.json|build\.gradle(\.kts)?|[^/]+\.csproj)$/i;

/**
 * Check if a file path is a manifest/dependency file.
 * Single source of truth — all consumers must use this function.
 */
export function isManifestFile(path: string): boolean {
    return MANIFEST_PATTERN.test(path);
}

/**
 * Framework signatures: dependency packages that identify a test framework.
 * Ordered by specificity (more specific first).
 */
const FRAMEWORK_SIGNATURES: Array<{
    name: string;
    deps: string[];
    confidence: number;
}> = [
    { name: 'cypress', deps: ['cypress'], confidence: 0.95 },
    { name: 'playwright', deps: ['@playwright/test', 'playwright'], confidence: 0.95 },
    { name: 'vitest', deps: ['vitest'], confidence: 0.9 },
    { name: 'jest', deps: ['jest'], confidence: 0.9 },
    { name: 'mocha', deps: ['mocha'], confidence: 0.8 },
    { name: 'pytest', deps: ['pytest'], confidence: 0.8 },
];

/**
 * Detect framework from dependency map.
 * Pure function — no side effects, no I/O.
 *
 * @param deps - Merged map of dependency names to versions (dependencies + devDependencies)
 * @returns Detected framework and confidence level
 */
export function detectFrameworkFromDeps(deps: Record<string, string>): FrameworkDetectionResult {
    const knownDeps = Object.keys(deps);
    for (const sig of FRAMEWORK_SIGNATURES) {
        for (const dep of sig.deps) {
            if (knownDeps.includes(dep)) {
                return { framework: sig.name, confidence: sig.confidence };
            }
        }
    }
    return { framework: 'unknown', confidence: 0 };
}

/**
 * Detect test framework from a repository via Contents API.
 * Attempts to read package.json, parse it, and detect framework from dependencies.
 * Falls back gracefully: returns unknown on any error.
 *
 * @param gitProvider - GitProvider instance with getFileContents
 * @param ref - Git ref (branch, tag, or SHA) to read from
 * @returns Detected framework and confidence level
 */
export async function detectFrameworkFromAPI(gitProvider: GitProvider, ref: string): Promise<FrameworkDetectionResult> {
    try {
        const content = await gitProvider.getFileContents('package.json', ref);
        if (content == null) {
            rootLogger.debug('Framework detection: package.json not found');
            return { framework: 'unknown', confidence: 0 };
        }

        let pkg: { [key: string]: unknown };
        try {
            pkg = JSON.parse(content) as { [key: string]: unknown };
        } catch {
            rootLogger.debug('Framework detection: invalid package.json');
            return { framework: 'unknown', confidence: 0 };
        }

        const deps: { [key: string]: string } = {
            ...(pkg['dependencies'] as { [key: string]: string }),
            ...(pkg['devDependencies'] as { [key: string]: string }),
        };

        return detectFrameworkFromDeps(deps);
    } catch (err) {
        rootLogger.debug(`Framework detection failed: ${humanizeError(String(err))?.msg ?? String(err)}`);
        return { framework: 'unknown', confidence: 0 };
    }
}
