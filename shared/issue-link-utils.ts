/** Shared utility for parsing linked issue strings.
 *  Format: "KEY (linkType), KEY2 (linkType2)"
 *  Same format used in CSV's "Linked Issues:" field. */
const LINKED_ISSUE_RE = /^([A-Z]+-\d+)\s*\((.+)\)$/;

export interface LinkedIssue {
    key: string;
    linkType: string;
}

/** Parse a comma-separated string of linked issues.
 *  Format per item: `KEY (linkType)` — e.g. `ECSPOL-428 (is a test for)`
 *  Throws on invalid format so the user gets immediate feedback. */
export function parseLinkedIssuesString(input: string): LinkedIssue[] {
    if (!input.trim()) return [];
    return input
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((part) => {
            const m = LINKED_ISSUE_RE.exec(part);
            if (!m || !m[1] || !m[2]) {
                throw new Error(`Formato inválido: "${part}". Use: KEY (tipo de ligação)`);
            }
            return { key: m[1], linkType: m[2].trim() };
        });
}

/** Deduplicate linked issues by key, keeping the first occurrence. */
export function deduplicateLinkedIssues(issues: LinkedIssue[]): LinkedIssue[] {
    return [...new Map(issues.map((i) => [i.key, i])).values()];
}
