import AdmZip from 'adm-zip';
import { parseCtrfResults, parseMochawesome, isCtrfFormat } from '../result_parser.js';
import { parseJUnitXml } from '../junit-xml-parser.js';
import { rootLogger } from '../logger.js';
import type { ParseResult, FlatTest } from '../result_parser.js';
import type { JUnitParseResult } from '../junit-xml-parser.js';

export interface ArtifactParseResult {
    fileName: string;
    data: ParseResult;
    format: 'ctrf' | 'junit' | 'mochawesome';
}

const JUNIT_TAGS = ['<testsuite', '<testsuites'];

export function isCTRF(content: string): boolean {
    try {
        const parsed = JSON.parse(content);
        return isCtrfFormat(parsed);
    } catch {
        return false;
    }
}

export function isJUnit(content: string): boolean {
    return JUNIT_TAGS.some((tag) => content.includes(tag));
}

export function isMochawesome(content: string): boolean {
    try {
        const parsed = JSON.parse(content);
        return parsed !== null && Object.prototype.toString.call(parsed) === '[object Object]' && 'stats' in parsed;
    } catch {
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
        const parsed = parseCtrfResults(JSON.parse(content));
        if (parsed.stats.total > 0 || parsed.tests.length > 0) {
            return { fileName, data: parsed, format: 'ctrf' };
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
        const parsed = parseMochawesome(JSON.parse(content));
        if (parsed.stats.total > 0 || parsed.tests.length > 0) {
            return { fileName, data: parsed, format: 'mochawesome' };
        }
        return null;
    }

    return null;
}

export function parseArtifactBuffer(buffer: Buffer, fileName: string): ArtifactParseResult | null {
    if (fileName.endsWith('.zip') || fileName.endsWith('.ZIP')) {
        const results = parseZipBuffer(buffer);
        return results.length > 0 ? results[0]! : null;
    }

    const content = buffer.toString('utf-8');
    return parseContent(content, fileName);
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
    } catch (err) {
        const msg =
            typeof (err as { message?: unknown })?.message === 'string'
                ? ((err as { message?: unknown }).message as string)
                : String(err);
        rootLogger.error(`artifact-parser: failed to parse ZIP: ${msg}`);
    }

    return results;
}
