import AdmZip from 'adm-zip';
import { parseCtrfResults, parseTestResults, isCtrfFormat } from '../result_parser.js';
import { parseJUnitXml } from '../junit-xml-parser.js';
import { rootLogger } from '../logger.js';
import { extractErrorMessage } from '../ui/prompt-errors.js';
import type { ParseResult, FlatTest, CtrfData } from '../result_parser.js';
import type { JUnitParseResult } from '../junit-xml-parser.js';
import type { RawCoverage } from '../types/data-hub.js';

export interface ArtifactParseResult {
    fileName: string;
    data: ParseResult;
    format: 'ctrf' | 'junit' | 'mochawesome';
    /** Coverage data extracted from CTRF reports (optional). */
    coverage?: RawCoverage;
}

const TEST_ARTIFACT_PATTERNS = ['ctrf', 'test-results', 'test-result', 'mochawesome', 'junit', 'e2e'];

/**
 * Checks if an artifact name matches known test artifact patterns.
 *
 * Matches: ctrf, test-results, test-result, mochawesome, junit, e2e.
 * Excludes: generic 'test' alone (too broad, captures non-test artifacts).
 */
export function isTestArtifact(name: string): boolean {
    const lower = name.toLowerCase();
    return TEST_ARTIFACT_PATTERNS.some((p) => lower.includes(p));
}

const JUNIT_TAGS = ['<testsuite', '<testsuites'];

export function isCTRF(content: string): boolean {
    try {
        const parsed = JSON.parse(content) as { [key: string]: unknown };
        return isCtrfFormat(parsed);
    } catch (err) {
        rootLogger.debug(`isCTRF: ${extractErrorMessage(err)}`);
        return false;
    }
}

export function isJUnit(content: string): boolean {
    return JUNIT_TAGS.some((tag) => content.includes(tag));
}

export function isMochawesome(content: string): boolean {
    try {
        const parsed = JSON.parse(content) as { [key: string]: unknown };
        return 'stats' in parsed;
    } catch (err) {
        rootLogger.debug(`isMochawesome: ${extractErrorMessage(err)}`);
        return false;
    }
}

function junitToParseResult(junit: JUnitParseResult): ParseResult {
    const statusMap: Record<string, 'passed' | 'failed' | 'skipped'> = {
        passed: 'passed',
        failed: 'failed',
        skipped: 'skipped',
        error: 'failed',
    };

    const tests: FlatTest[] = junit.tests.map((t) => ({
        title: t.title,
        state: statusMap[t.status] ?? 'passed',
        duration: Math.round(t.time * 1000),
        ...(t.message !== undefined ? { error: t.message } : {}),
        fullTitle: t.classname ? `${t.classname} > ${t.title}` : t.title,
    }));

    return {
        tests,
        stats: {
            passed: junit.stats.passed,
            failed: junit.stats.failed,
            skipped: junit.stats.skipped,
            total: junit.stats.total,
            duration: junit.stats.duration,
        },
    };
}

function parseContent(content: string, fileName: string): ArtifactParseResult | null {
    if (isCTRF(content)) {
        const jsonData = JSON.parse(content) as CtrfData;
        const parsed = parseCtrfResults(jsonData);
        if (parsed.stats.total > 0 || parsed.tests.length > 0) {
            // Extract coverage from CTRF if present
            const coverage = extractCtrfCoverage(jsonData);
            const result: ArtifactParseResult = { fileName, data: parsed, format: 'ctrf' };
            if (coverage != null) result.coverage = coverage;
            return result;
        }
        rootLogger.debug(`artifact-parser: CTRF file ${fileName} has 0 tests, skipping`);
        return null;
    }

    if (isJUnit(content)) {
        const parsed = parseJUnitXml(content);
        if (parsed && (parsed.stats.total > 0 || parsed.tests.length > 0)) {
            return { fileName, data: junitToParseResult(parsed), format: 'junit' };
        }
        return null;
    }

    if (isMochawesome(content)) {
        const parsed = parseTestResults(JSON.parse(content) as unknown);
        if (parsed.stats.total > 0 || parsed.tests.length > 0) {
            return { fileName, data: parsed, format: 'mochawesome' };
        }
        return null;
    }

    return null;
}

/**
 * Extract coverage data from CTRF JSON if present.
 * CTRF format may include coverage in results.coverage.
 */
function extractCtrfCoverage(jsonData: CtrfData): RawCoverage | null {
    const cov = jsonData.results?.coverage;
    if (cov == null) return null;
    if (typeof cov.percentage !== 'number' || !Number.isFinite(cov.percentage)) return null;
    return {
        total: typeof cov.total === 'number' ? cov.total : 0,
        covered: typeof cov.covered === 'number' ? cov.covered : 0,
        percentage: cov.percentage,
    };
}

export function parseArtifactBuffer(buffer: Buffer, fileName: string): ArtifactParseResult | null {
    const all = parseArtifactBufferAll(buffer, fileName);
    return all.length > 0 ? (all[0] as ArtifactParseResult) : null;
}

export function parseArtifactBufferAll(buffer: Buffer, fileName: string): ArtifactParseResult[] {
    if (fileName.endsWith('.zip') || fileName.endsWith('.ZIP')) {
        return parseZipBuffer(buffer);
    }

    const content = buffer.toString('utf-8');
    const result = parseContent(content, fileName);
    return result != null ? [result] : [];
}

export function parseZipBuffer(buffer: Buffer): ArtifactParseResult[] {
    const results: ArtifactParseResult[] = [];

    try {
        const zip = new AdmZip(buffer);
        const entries = zip.getEntries();

        for (const entry of entries) {
            if (entry.isDirectory) continue;

            const content = entry.getData().toString('utf-8');
            const result = parseContent(content, entry.entryName);
            if (result) {
                results.push(result);
            }
        }
    } catch (err: unknown) {
        rootLogger.error(`artifact-parser: failed to parse ZIP: ${extractErrorMessage(err)}`);
    }

    return results;
}
