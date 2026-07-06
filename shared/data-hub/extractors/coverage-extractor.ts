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
    if (!cov) return null;
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
    const matched = /Coverage:\s*([\d.]+)%\s*\((\d+)\/(\d+)\)/.exec(text);
    if (matched) {
        const totalStr = matched[3];
        const coveredStr = matched[2];
        const pctStr = matched[1];
        if (!totalStr || !coveredStr || !pctStr) return null;
        return {
            total: parseInt(totalStr, 10),
            covered: parseInt(coveredStr, 10),
            percentage: parseFloat(pctStr),
        };
    }
    const covIdx = text.search(/coverage:\s*/i);
    if (covIdx !== -1) {
        const after = text.slice(covIdx);
        const pctExec = /\d[\d.]*/.exec(after);
        if (pctExec && after.charAt(pctExec.index + pctExec[0].length) === '%') {
            const pct = parseFloat(pctExec[0]);
            if (Number.isFinite(pct)) {
                return { total: 0, covered: 0, percentage: pct };
            }
        }
    }
    return null;
}

function fromJson(data: { total: number; covered: number; percentage: number }): RawCoverage | null {
    if (!Number.isFinite(data.percentage)) return null;
    return {
        total: data.total,
        covered: data.covered,
        percentage: data.percentage,
    };
}

function fromCheckRunSummary(summary: string): RawCoverage | null {
    const covIdx = summary.search(/coverage:\s*/i);
    if (covIdx !== -1) {
        const after = summary.slice(covIdx);
        const pctExec = /\d[\d.]*/.exec(after);
        if (pctExec && after.charAt(pctExec.index + pctExec[0].length) === '%') {
            const pct = parseFloat(pctExec[0]);
            if (Number.isFinite(pct)) {
                return { total: 0, covered: 0, percentage: pct };
            }
        }
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
