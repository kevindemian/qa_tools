/**
 * Data Hub — Coverage Provider.
 *
 * Reads coverage data from Istanbul/CTRF JSON files.
 * Implements DataProvider for coverage data source.
 */
import * as fsp from 'node:fs/promises';
import { resolve } from 'node:path';
import type { DataProvider, FetchOptions, RawData, RawCoverage } from '../../types/data-hub.js';
import { rootLogger } from '../../logger.js';
import { extractErrorMessage } from '../../prompt-errors.js';

/** Istanbul coverage summary format. */
interface IstanbulFileEntry {
    lines: { total: number; covered: number; skipped: number; pct: number };
    functions: { total: number; covered: number; skipped: number; pct: number };
    branches: { total: number; covered: number; skipped: number; pct: number };
    statements: { total: number; covered: number; skipped: number; pct: number };
}

/** Istanbul coverage summary root. */
interface IstanbulSummary {
    total?: IstanbulFileEntry;
    [filePath: string]: IstanbulFileEntry | undefined;
}

export class CoverageDataProvider implements DataProvider {
    readonly name = 'coverage';
    readonly source = 'coverage' as const;

    constructor(private readonly coveragePath: string) {}

    async fetchRawData(_options: FetchOptions): Promise<RawData> {
        const coverage = await this.readCoverage();
        return {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
            ...(coverage != null ? { coverage } : {}),
        };
    }

    private async readCoverage(): Promise<RawCoverage | undefined> {
        try {
            const resolvedPath = resolve(this.coveragePath);
            const raw = (await Reflect.apply(fsp.readFile, undefined, [resolvedPath, 'utf-8'])) as string;
            const summary = JSON.parse(raw) as IstanbulSummary;

            if (!summary.total) return undefined;

            const files: Record<string, { total: number; covered: number; percentage: number }> = {};
            for (const [key, value] of Object.entries(summary)) {
                if (key === 'total' || !value) continue;
                Object.defineProperty(files, key, {
                    value: {
                        total: value.lines.total,
                        covered: value.lines.covered,
                        percentage: value.lines.pct,
                    },
                    enumerable: true,
                    writable: true,
                    configurable: true,
                });
            }

            return {
                total: summary.total.lines.total,
                covered: summary.total.lines.covered,
                percentage: summary.total.lines.pct,
                files,
            };
        } catch (err: unknown) {
            rootLogger.debug(`Coverage: failed to read ${this.coveragePath}: ${extractErrorMessage(err)}`);
            return undefined;
        }
    }
}
