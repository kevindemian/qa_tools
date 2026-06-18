/**
 * Integration test helpers — shared infrastructure for all feature integration tests.
 *
 * Provides:
 * - Isolated temporary directories per test
 * - Realistic fixture data factories
 * - Cleanup utilities
 * - Assertion helpers for common output patterns
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FeatureConfigStore } from '../../types/feature-config.js';

/**
 * Create an isolated temporary directory for a test suite.
 * @param prefix — descriptive prefix for the directory name
 * @returns Absolute path to the created directory
 */
export function createTestDir(prefix: string): string {
    if (prefix.length === 0) {
        throw new Error('createTestDir: prefix must not be empty');
    }
    try {
        return fs.mkdtempSync(path.join(os.tmpdir(), `integration-${prefix}-`));
    } catch (err: unknown) {
        throw new Error(`createTestDir("${prefix}"): failed to create temp dir — ${String(err)}`, { cause: err });
    }
}

/**
 * Recursively remove a directory. Best-effort — does not throw on failure.
 * @param dir — absolute path to remove
 */
export function cleanupTestDir(dir: string): void {
    try {
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return;
        process.stderr.write(
            `[integration-helpers] cleanupTestDir("${dir}"): ${String(err)}. Verifique permissões do diretório e espaço em disco.\n`,
        );
    }
}

/**
 * Create a file inside a directory, creating parent directories as needed.
 * @param baseDir — parent directory
 * @param relPath — relative path from baseDir
 * @param content — file content
 * @returns Absolute path to the created file
 */
export function createFile(baseDir: string, relPath: string, content: string): string {
    const full = path.resolve(baseDir, relPath);
    const baseResolved = path.resolve(baseDir) + path.sep;
    if (!full.startsWith(baseResolved)) {
        throw new Error(`createFile: path traversal detected — "${relPath}" resolves outside "${baseDir}"`);
    }
    try {
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf8');
        return full;
    } catch (err: unknown) {
        throw new Error(`createFile("${baseDir}", "${relPath}"): failed — ${String(err)}`, { cause: err });
    }
}

/**
 * Read a file and return its content as string.
 * Returns null if the file does not exist.
 */
export function readFile(baseDir: string, relPath: string): string | null {
    const full = path.join(baseDir, relPath);
    try {
        return fs.readFileSync(full, 'utf8');
    } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
        process.stderr.write(
            `[integration-helpers] readFile("${baseDir}", "${relPath}"): ${String(err)}. Verifique se o arquivo existe e as permissões de leitura.\n`,
        );
        return null;
    }
}

/**
 * Check if a file exists.
 */
export function fileExists(baseDir: string, relPath: string): boolean {
    try {
        return fs.existsSync(path.join(baseDir, relPath));
    } catch {
        return false;
    }
}

/**
 * Parse a JSON file and return the parsed object.
 * Returns null on any error.
 */
export function readJsonFile<T = unknown>(baseDir: string, relPath: string): T | null {
    const content = readFile(baseDir, relPath);
    if (content === null) return null;
    try {
        const parsed: unknown = JSON.parse(content);
        if (typeof parsed !== 'object' || parsed === null) {
            process.stderr.write(
                `[integration-helpers] readJsonFile("${baseDir}", "${relPath}"): expected object, got ${typeof parsed}. Verifique o formato do arquivo JSON.\n`,
            );
            return null;
        }
        return parsed as T;
    } catch (err: unknown) {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
        process.stderr.write(
            `[integration-helpers] readJsonFile("${baseDir}", "${relPath}"): ${String(err)}. Verifique permissões e integridade do arquivo.\n`,
        );
        return null;
    }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Fixture Factories — realistic data for each feature domain
 * ────────────────────────────────────────────────────────────────────────── */

export interface MetricsRunFixture {
    timestamp: string;
    project: string;
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    tests: Array<{
        title: string;
        state: 'passed' | 'failed' | 'skipped';
        duration: number;
        error?: string;
    }>;
}

/** Create a realistic metrics run fixture. */
export function createMetricsRunFixture(overrides: Partial<MetricsRunFixture> = {}): MetricsRunFixture {
    return {
        timestamp: new Date().toISOString(),
        project: 'test-project',
        total: 100,
        passed: 90,
        failed: 8,
        skipped: 2,
        duration: 15000,
        tests: [
            { title: 'test should pass', state: 'passed', duration: 50 },
            {
                title: 'test should fail',
                state: 'failed',
                duration: 120,
                error: 'AssertionError: expected 1 to equal 2',
            },
            { title: 'test should skip', state: 'skipped', duration: 0 },
        ],
        ...overrides,
    };
}

export interface CoverageSnapshotFixture {
    timestamp: string;
    project: string;
    totalIssues: number;
    mappedIssues: number;
    coveragePct: number;
}

/** Create a realistic coverage snapshot fixture. */
export function createCoverageSnapshotFixture(
    overrides: Partial<CoverageSnapshotFixture> = {},
): CoverageSnapshotFixture {
    return {
        timestamp: new Date().toISOString(),
        project: 'test-project',
        totalIssues: 500,
        mappedIssues: 450,
        coveragePct: 90,
        ...overrides,
    };
}

export interface FailureClassificationFixture {
    timestamp: string;
    testTitle: string;
    category: string;
    project: string;
}

/** Create a realistic failure classification fixture. */
export function createFailureClassificationFixture(
    overrides: Partial<FailureClassificationFixture> = {},
): FailureClassificationFixture {
    return {
        timestamp: new Date().toISOString(),
        testTitle: 'test should work',
        category: 'ASSERTION',
        project: 'test-project',
        ...overrides,
    };
}

/** Create a realistic features.json content. */
export function createFeaturesJsonFixture(): FeatureConfigStore {
    return {
        'test-project': {
            gitProvider: 'github',
            repo: 'owner/test-project',
            features: {
                prReport: {
                    enabled: true,
                    publishTarget: 'github-actions',
                },
            },
        },
        'gitlab-project': {
            gitProvider: 'gitlab',
            repo: 'group/gitlab-project',
            features: {
                prReport: {
                    enabled: false,
                    publishTarget: 'gitlab-ci',
                },
            },
        },
    };
}

/** Create a realistic FlatTest array fixture. */
export function createFlatTestArrayFixture(): Array<{
    title: string;
    state: 'passed' | 'failed' | 'skipped';
    duration: number;
    error?: string;
}> {
    return [
        { title: 'login should succeed with valid credentials', state: 'passed', duration: 45 },
        { title: 'login should fail with invalid password', state: 'passed', duration: 32 },
        { title: 'dashboard should render charts', state: 'passed', duration: 120 },
        {
            title: 'settings page should save preferences',
            state: 'failed',
            duration: 89,
            error: 'Timeout: element not found',
        },
        { title: 'api response should be cached', state: 'skipped', duration: 0 },
    ];
}
