import type { RawCoverage } from '../../types/data-hub.js';

export interface CoverageInput {
    ctrf?: {
        results?: {
            summary?: unknown;
            tests?: unknown[];
            coverage?: { total?: number; covered?: number; percentage: number };
        };
    };
    gitlabCoverage?: string;
    logText?: string;
    jsonCoverage?: { total: number; covered: number; percentage: number };
    checkRunSummary?: string;
}

function fromCtrf(data: CoverageInput['ctrf']): RawCoverage | null {
    if (!data) return null;
    const cov = data.results?.coverage;
    if (!cov || cov.percentage === undefined) return null;
    return {
        total: cov.total ?? 0,
        covered: cov.covered ?? 0,
        percentage: cov.percentage,
    };
}

function fromGitlab(coverage: string): RawCoverage | null {
    const pct = parseFloat(coverage);
    if (!Number.isFinite(pct)) return null;
    return { total: 0, covered: 0, percentage: pct };
}

function fromLog(text: string): RawCoverage | null {
    const matched = text.match(/Coverage:\s*([\d.]+)%\s*\((\d+)\/(\d+)\)/);
    if (matched) {
        return {
            total: parseInt(matched[3]!, 10),
            covered: parseInt(matched[2]!, 10),
            percentage: parseFloat(matched[1]!),
        };
    }
    const simple = text.match(/(?:Line\s+)?[Cc]overage:\s*([\d.]+)%/);
    if (simple) {
        return { total: 0, covered: 0, percentage: parseFloat(simple[1]!) };
    }
    return null;
}

function fromJson(data: { total: number; covered: number; percentage: number }): RawCoverage | null {
    if (!Number.isFinite(data.percentage)) return null;
    return {
        total: data.total ?? 0,
        covered: data.covered ?? 0,
        percentage: data.percentage,
    };
}

function fromCheckRunSummary(summary: string): RawCoverage | null {
    const matched = summary.match(/(?:Line\s+)?[Cc]overage:\s*([\d.]+)%/);
    if (matched) {
        return { total: 0, covered: 0, percentage: parseFloat(matched[1]!) };
    }
    return null;
}

export function extractCoverage(input: CoverageInput): RawCoverage | null {
    if (input.ctrf) {
        const result = fromCtrf(input.ctrf);
        if (result) return result;
    }
    if (input.gitlabCoverage !== undefined) {
        const result = fromGitlab(input.gitlabCoverage);
        if (result) return result;
    }
    if (input.logText) {
        const result = fromLog(input.logText);
        if (result) return result;
    }
    if (input.checkRunSummary) {
        const result = fromCheckRunSummary(input.checkRunSummary);
        if (result) return result;
    }
    if (input.jsonCoverage) {
        const result = fromJson(input.jsonCoverage);
        if (result) return result;
    }
    return null;
}
