/**
 * Data Hub — Coverage Provider.
 *
 * Reads coverage data from Istanbul/CTRF JSON files (aggregate `RawCoverage`)
 * and, when a `GitProvider` is supplied, ALSO extracts per-file coverage
 * (`RawData.coverageFiles`) from CI run artifacts (Istanbul json-summary,
 * Cobertura, JaCoCo). Implements DataProvider for the coverage data source.
 */
import * as fsp from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
    DataProvider,
    FetchOptions,
    RawData,
    RawCoverage,
    CoverageFile,
    DataSource,
} from '../../types/data-hub.js';
import type { GitProvider } from '../../types/ci-cd.js';
import { rootLogger } from '../../logger.js';
import { extractErrorMessage } from '../../prompt-errors.js';
import {
    extractCoverageFiles,
    isCoverageArtifact,
    COVERAGE_FILES_CONFIDENCE,
} from '../extractors/coverage-files-extractor.js';

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

function buildCoverageFilesProvenance(): Map<string, DataSource> {
    const provenance = new Map<string, DataSource>();
    provenance.set('coverageFiles', {
        confidence: COVERAGE_FILES_CONFIDENCE,
        source: 'ci-artifacts',
        timestamp: new Date().toISOString(),
    });
    return provenance;
}

export class CoverageDataProvider implements DataProvider {
    readonly name = 'coverage';
    readonly source = 'coverage' as const;

    constructor(
        private readonly coveragePath: string,
        private readonly gitProvider?: GitProvider,
    ) {}

    async fetchRawData(options: FetchOptions): Promise<RawData> {
        const coverage = await this.readCoverage();
        const { coverageFiles, provenance } = await this.readCoverageFiles(options);
        return {
            runs: [],
            jobs: new Map(),
            artifacts: new Map(),
            failureReasons: new Map(),
            ...(coverage != null ? { coverage } : {}),
            ...(this.gitProvider != null ? { coverageFiles } : {}),
            ...(provenance != null ? { provenance } : {}),
        };
    }

    /**
     * Per-file coverage extraction (FASE EXPAND). Iterates recent pipeline
     * artifacts via the injected GitProvider, downloads coverage reports and
     * parses them into CoverageFile[]. Absent a GitProvider, produces an empty
     * result — coverage per-file is NEVER fabricated (AGENTS §25).
     */
    private async readCoverageFiles(
        options: FetchOptions,
    ): Promise<{ coverageFiles: CoverageFile[]; provenance: Map<string, DataSource> | undefined }> {
        const coverageFiles: CoverageFile[] = [];
        const git = this.gitProvider;
        if (git == null) return { coverageFiles, provenance: undefined };

        const runs = await git.getRecentPipelines(options.count, options.since);
        for (const run of runs) {
            if (run.id == null) continue;
            await this.collectRunCoverage(git, run.id, coverageFiles);
        }

        if (coverageFiles.length === 0) return { coverageFiles, provenance: undefined };

        return { coverageFiles, provenance: buildCoverageFilesProvenance() };
    }

    private async collectRunCoverage(
        git: GitProvider,
        runId: string | number,
        coverageFiles: CoverageFile[],
    ): Promise<void> {
        const artifacts = await git.listPipelineArtifacts(runId);
        for (const artifact of artifacts) {
            if (!isCoverageArtifact(artifact.name)) continue;
            const { buffer, filename } = await git.downloadArtifact(artifact.id);
            const result = extractCoverageFiles(filename.length > 0 ? filename : artifact.name, buffer);
            // Surfaced, never swallowed (AGENTS §25): malformed entries dropped, logged.
            for (const err of result.errors) {
                const scope = err.entry != null ? `${err.artifact} (${err.entry})` : err.artifact;
                rootLogger.warn(`Coverage: dropped entry from ${scope}: ${err.reason}`);
            }
            coverageFiles.push(...result.files);
        }
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
