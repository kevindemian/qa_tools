import { categorizeFailure } from '../../log-parser.js';
import type { FailureRecord } from '../../types/data-hub.js';

export interface CheckRunAnnotation {
    path: string;
    start_line: number;
    end_line: number;
    message: string;
    annotation_level: string;
}

export interface StepConclusion {
    name: string;
    conclusion: string;
    number: number;
}

export interface FailureEntry {
    stepName?: string;
    reason?: string;
    message?: string;
    file?: string;
    line?: number;
    /** Annotation/test level (failure, warning, notice). */
    level?: string;
    /** End line when available (e.g. check-run annotations). */
    endLine?: number;
    /** Root-cause bucket (assertion | timeout | network | panic | known-bug | environment). */
    category?: string;
    /** Confidence in the extraction (0-1). Required — every classified entry carries provenance. */
    confidence: number;
    /** Provenance source (e.g., 'check-run-annotation', 'github-step', 'log-regex', 'gitlab-reason'). */
    source: string;
}

// Structured API sources (steps, annotations, GitLab failure_reason) are more
// reliable than raw-log regex. Mirrors ANNOTATION_CONFIDENCE (0.8) in
// annotations-extractor.ts and LOG_CONFIDENCE (0.6) in log-parser.ts.
const STRUCTURED_CONFIDENCE = 0.8;
const LOG_CONFIDENCE = 0.6;

export interface FailureInput {
    gitlabFailureReason?: string;
    githubSteps?: StepConclusion[];
    checkRunAnnotations?: CheckRunAnnotation[];
    logText?: string;
}

function fromGitlab(reason: string): FailureEntry[] {
    return [
        {
            reason,
            category: categorizeFailure(reason),
            confidence: STRUCTURED_CONFIDENCE,
            source: 'gitlab-reason',
        },
    ];
}

function fromSteps(steps: StepConclusion[]): FailureEntry[] {
    return steps
        .filter((s) => s.conclusion === 'failure')
        .map((s) => ({
            stepName: s.name,
            reason: s.conclusion,
            category: categorizeFailure(s.name),
            confidence: STRUCTURED_CONFIDENCE,
            source: 'github-step',
        }));
}

function fromAnnotations(annotations: CheckRunAnnotation[]): FailureEntry[] {
    return annotations
        .filter((a) => a.annotation_level === 'failure' || a.annotation_level === 'warning')
        .map((a) => ({
            message: a.message,
            file: a.path,
            line: a.start_line,
            endLine: a.end_line,
            level: a.annotation_level,
            category: categorizeFailure(a.message),
            confidence: STRUCTURED_CONFIDENCE,
            source: 'check-run-annotation',
        }));
}

function fromLog(text: string): FailureEntry[] {
    const failures: FailureEntry[] = [];
    const seen = new Set<string>();

    const patterns = [/Error[:\s]+(.{10,200})/g, /Failure[:\s]+(.{10,200})/g];

    for (const pattern of patterns) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
            const group = match[1];
            if (!group) continue;
            const msg = group.trim();
            if (msg && msg.length >= 10 && !seen.has(msg)) {
                seen.add(msg);
                failures.push({
                    message: msg,
                    category: categorizeFailure(msg),
                    confidence: LOG_CONFIDENCE,
                    source: 'log-regex',
                });
            }
        }
    }

    return failures;
}

/**
 * Maps a classified {@link FailureEntry} to the canonical {@link FailureRecord}.
 * Absorbs `category`/`confidence`/`source`/`file`/`line` — never drops them to
 * null (AGENTS §25). `warning`-level annotations become `broken` (infra/env),
 * everything else `failed` (product defect), preserving the broken/failed
 * distinction from annotations-extractor.ts.
 */
export function failureEntryToRecord(entry: FailureEntry): FailureRecord {
    const name = entry.reason ?? entry.message ?? entry.stepName ?? 'Unknown failure';
    const message = entry.message ?? entry.reason ?? entry.stepName;
    const status: FailureRecord['status'] = entry.level === 'warning' ? 'broken' : 'failed';
    return {
        name,
        message,
        file: entry.file,
        line: entry.line == null || !Number.isFinite(entry.line) ? undefined : entry.line,
        status,
        category: entry.category,
        confidence: entry.confidence,
        source: entry.source,
    };
}

export function classifyFailures(input: FailureInput): FailureEntry[] {
    if (input.gitlabFailureReason !== undefined) {
        return fromGitlab(input.gitlabFailureReason);
    }
    if (input.githubSteps && input.githubSteps.length > 0) {
        const result = fromSteps(input.githubSteps);
        if (result.length > 0) return result;
    }
    if (input.checkRunAnnotations && input.checkRunAnnotations.length > 0) {
        const result = fromAnnotations(input.checkRunAnnotations);
        if (result.length > 0) return result;
    }
    if (input.logText) {
        const result = fromLog(input.logText);
        if (result.length > 0) return result;
    }
    return [];
}
