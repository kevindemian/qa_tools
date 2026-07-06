import { parseJUnitXml } from '../../junit-xml-parser.js';
import { parseTestSummaryFromLogs } from '../../log-parser.js';

export interface TestCountInput {
    ctrf?: {
        results?: {
            summary?: {
                passed?: number;
                failed?: number;
                skipped?: number;
                total?: number;
            };
        };
    };
    junitXml?: string;
    checkRunSummary?: string;
    logText?: string;
    mochawesome?: {
        stats?: {
            passes?: number;
            failures?: number;
            pending?: number;
            tests?: number;
        };
    };
}

function fromCtrf(
    data: TestCountInput['ctrf'],
): { passed: number; failed: number; skipped: number; total: number } | null {
    if (!data?.results?.summary) return null;
    const s = data.results.summary;
    if (s.total === undefined || s.total === null) return null;
    return {
        passed: s.passed ?? 0,
        failed: s.failed ?? 0,
        skipped: s.skipped ?? 0,
        total: s.total,
    };
}

function fromJunit(xml: string): { passed: number; failed: number; skipped: number; total: number } | null {
    const parsed = parseJUnitXml(xml);
    if (!parsed) return null;
    return {
        passed: parsed.stats.passed,
        failed: parsed.stats.failed,
        skipped: parsed.stats.skipped,
        total: parsed.stats.total,
    };
}

function fromCheckRunSummary(
    summary: string,
): { passed: number; failed: number; skipped: number; total: number } | null {
    const m = summary.match(/Tests:\s*(\d+)\s+passed,\s*(\d+)\s+failed,\s*(\d+)\s+total/);
    if (m) {
        return { passed: parseInt(m[1]!, 10), failed: parseInt(m[2]!, 10), skipped: 0, total: parseInt(m[3]!, 10) };
    }
    return null;
}

function fromMochawesome(
    data: TestCountInput['mochawesome'],
): { passed: number; failed: number; skipped: number; total: number } | null {
    const s = data?.stats;
    if (!s || s.tests === undefined || s.tests === null) return null;
    return {
        passed: s.passes ?? 0,
        failed: s.failures ?? 0,
        skipped: s.pending ?? 0,
        total: s.tests,
    };
}

function fromLog(text: string): { passed: number; failed: number; skipped: number; total: number } | null {
    const parsed = parseTestSummaryFromLogs(text);
    return parsed.testCounts ?? null;
}

export function extractTestCounts(
    input: TestCountInput,
): { passed: number; failed: number; skipped: number; total: number } | null {
    if (input.ctrf) {
        const result = fromCtrf(input.ctrf);
        if (result) return result;
    }
    if (input.junitXml) {
        const result = fromJunit(input.junitXml);
        if (result) return result;
    }
    if (input.checkRunSummary) {
        const result = fromCheckRunSummary(input.checkRunSummary);
        if (result) return result;
    }
    if (input.mochawesome) {
        const result = fromMochawesome(input.mochawesome);
        if (result) return result;
    }
    if (input.logText) {
        const result = fromLog(input.logText);
        if (result) return result;
    }
    return null;
}
