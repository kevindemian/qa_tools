import type { InvariantFn, ValidationContext } from '../artifact-validator.js';
export type { InvariantFn, ValidationContext };

export interface TestCaseShape {
    title?: string;
    steps?: string[];
    expectedResult?: string;
    preConditions?: unknown[];
    coverage?: Array<{ criterionId: string; criterionText: string }>;
}

export function parseTests(artifact: unknown): TestCaseShape[] {
    if (typeof artifact !== 'object' || artifact === null) return [];
    const obj = artifact as Record<string, unknown>;
    if (Array.isArray(obj)) return obj as TestCaseShape[];
    if (Array.isArray(obj.tests)) return obj.tests as TestCaseShape[];
    return [];
}

export function extractCriteria(input: string): string[] {
    const lines = input.split('\n');
    const criteria: string[] = [];
    let inCriteria = false;
    for (const line of lines) {
        const trimmed = line.trim();
        if (/^(acceptance\s*criteria|scenarios|cenarios|criteria|criterion):/i.test(trimmed)) {
            inCriteria = true;
            const afterPrefix = trimmed.replace(/^[^:]+:\s*/, '');
            if (afterPrefix) criteria.push(afterPrefix);
            continue;
        }
        if (inCriteria) {
            if (
                /^(given|when|then|scenario|test|cenario|given that)/i.test(trimmed) ||
                trimmed.startsWith('-') ||
                trimmed.startsWith('*') ||
                /^\d+[.)]/.test(trimmed)
            ) {
                const cleaned = trimmed.replace(/^[-*\d.)\s]+/, '');
                if (cleaned) criteria.push(cleaned);
            } else if (trimmed === '' || /^(user story|description|acceptance|scenarios)/i.test(trimmed)) {
                inCriteria = false;
            }
        }
    }
    return criteria.length > 0 ? criteria : extractFallback(input);
}

function extractFallback(input: string): string[] {
    return input
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 15 && !l.startsWith('#') && !l.startsWith('//'))
        .slice(0, 20);
}
