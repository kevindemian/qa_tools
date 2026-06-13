/**
 * Coverage source reader — resolves code coverage from multiple sources.
 *
 * Layered resolution order (best available first):
 *   1. Istanbul coverage/coverage-summary.json (standalone, always available with --coverage)
 *   2. CTRF JSON coverage field (fallback)
 *   3. None (defaults to 0)
 *
 * Each source is independent; no layer requires configuration from another.
 */

import fs from 'node:fs';
import path from 'node:path';

export type CoverageSourceType = 'istanbul' | 'ctrf' | 'none';

export interface CoverageResult {
    coveragePct: number;
    source: CoverageSourceType;
    detail?: string;
}

function parseIstanbul(raw: string): IstanbulSummary {
    return JSON.parse(raw) as IstanbulSummary;
}

interface IstanbulSummary {
    total?: {
        lines?: { total: number; covered: number; pct: number };
        statements?: { total: number; covered: number; pct: number };
        functions?: { total: number; covered: number; pct: number };
        branches?: { total: number; covered: number; pct: number };
    };
    [filePath: string]: unknown;
}

const DEFAULT_COVERAGE_PATH = 'coverage/coverage-summary.json';

/**
 * Read Istanbul code coverage from coverage/coverage-summary.json.
 * Returns the lines coverage percentage, or undefined if the file doesn't exist.
 */
export function readIstanbulCoverage(coveragePath?: string): CoverageResult | undefined {
    const resolvedPath = path.resolve(coveragePath ?? DEFAULT_COVERAGE_PATH);
    try {
        if (!fs.existsSync(resolvedPath)) {
            return undefined;
        }
        const raw = fs.readFileSync(resolvedPath, 'utf8');
        const json = parseIstanbul(raw);
        const total = json.total;
        if (!total) return undefined;
        const lines = total.lines;
        const statements = total.statements;
        const pct = lines?.pct ?? statements?.pct;
        if (pct === undefined) return undefined;
        return {
            coveragePct: pct,
            source: 'istanbul',
            detail: `lines ${pct.toFixed(1)}%` + (lines ? ` (${lines.covered}/${lines.total})` : ''),
        };
    } catch {
        return undefined;
    }
}

/**
 * Resolve coverage from available sources in priority order.
 * Returns the best available coverage data, or undefined if no source has data.
 */
export function resolveCoverage(options?: {
    istanbulPath?: string;
    ctrfCoverage?: number;
}): CoverageResult | undefined {
    const istanbul = readIstanbulCoverage(options?.istanbulPath);
    if (istanbul) return istanbul;
    if (options?.ctrfCoverage !== undefined && options.ctrfCoverage >= 0) {
        return {
            coveragePct: options.ctrfCoverage,
            source: 'ctrf',
            detail: `ctrf ${options.ctrfCoverage.toFixed(1)}%`,
        };
    }
    return undefined;
}
