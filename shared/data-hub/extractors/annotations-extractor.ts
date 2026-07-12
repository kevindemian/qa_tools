import type { CheckRunAnnotation, GitLabTestCase } from '../../types/ci-cd.js';
import { categorizeFailure, detectFileLine } from '../../log-parser.js';
import type { FailureRecord } from '../../types/data-hub.js';

// Annotations are STRUCTURED sources (GitHub/GitLab API), more reliable than
// raw logs. Confidence reflects provenance: above the log-based 0.6 last-resort.
const ANNOTATION_CONFIDENCE = 0.8;

function statusForAnnotationLevel(level: string): 'failed' | 'broken' {
    return level === 'failure' ? 'failed' : 'broken';
}

function githubAnnotationToRecord(a: CheckRunAnnotation): FailureRecord {
    const name = a.message && a.message.length > 0 ? a.message : a.path;
    const line = Number.isFinite(a.start_line) ? a.start_line : undefined;
    return {
        name,
        file: a.path || undefined,
        line,
        message: a.message || undefined,
        status: statusForAnnotationLevel(a.annotation_level),
        category: categorizeFailure(a.message || ''),
        confidence: ANNOTATION_CONFIDENCE,
        source: 'github-annotation',
    };
}

/** LA-1 — GitHub check-run annotations → canonical FailureRecord[]. */
export function githubAnnotationsToFailureRecords(annotations: CheckRunAnnotation[] | undefined): FailureRecord[] {
    if (!Array.isArray(annotations)) return [];
    return annotations
        .filter((a) => a.annotation_level === 'failure' || a.annotation_level === 'warning')
        .map(githubAnnotationToRecord);
}

function gitlabCaseToRecord(tc: GitLabTestCase): FailureRecord {
    const status: 'failed' | 'broken' = tc.status === 'failed' ? 'failed' : 'broken';
    const loc = tc.stack_trace ? detectFileLine(tc.stack_trace) : {};
    return {
        name: tc.name,
        suite: tc.classname || undefined,
        message: tc.stack_trace || undefined,
        trace: tc.stack_trace || undefined,
        file: loc.file,
        line: loc.line,
        status,
        category: categorizeFailure(tc.stack_trace || tc.name),
        confidence: ANNOTATION_CONFIDENCE,
        source: 'gitlab-test-report',
    };
}

/** LA-1 — GitLab test cases (failed/error) → canonical FailureRecord[]. */
export function gitlabTestCasesToFailureRecords(cases: GitLabTestCase[] | undefined): FailureRecord[] {
    if (!Array.isArray(cases)) return [];
    return cases.filter((c) => c.status === 'failed' || c.status === 'error').map(gitlabCaseToRecord);
}
