/** CSV quoted-value parser. Handles double-quoted values, multi-line quoted
 * values (spanning CSV rows), and escaped quotes (""). Used by csv_resource.ts
 * to parse CSV fields that may contain commas, newlines, or special characters. */

const PRECONDITION_KEY_PATTERN = '[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*\\-\\d+';

const PRECONDITION_KEY_RE = new RegExp('^' + PRECONDITION_KEY_PATTERN + '$');

/** Check if a string matches the precondition key format (e.g., PRECOND-123). */
export function isPreconditionKey(value: string): boolean {
    return PRECONDITION_KEY_RE.test(value);
}

/** Extract a precondition key from the start of a string. Returns null if not found. */
export function extractPreconditionKey(value: string): string | null {
    const match = value.match(new RegExp('^(' + PRECONDITION_KEY_PATTERN + ')'));
    return match ? (match[1] ?? null) : null;
}

/** Parse a potentially quoted CSV value, handling multi-line quoted spans.
 * @param rawValue - The raw value from the current CSV line.
 * @param lines - All CSV lines (for multi-line lookahead).
 * @param startLineIndex - Current line index.
 * @returns An object with the parsed value and the end line index. */
export function parseQuotedValue(
    rawValue: string,
    lines: string[],
    startLineIndex: number,
): { value: string; endIndex: number } {
    if (rawValue.startsWith('"') && rawValue.endsWith('"') && rawValue.length >= 2) {
        return { value: rawValue.slice(1, -1).replace(/""/g, '"'), endIndex: startLineIndex + 1 };
    }
    if (rawValue.startsWith('"')) {
        const parts = [rawValue.slice(1)];
        let endIndex = startLineIndex + 1;
        while (endIndex < lines.length) {
            const lineMap = new Map(lines.map((l, idx) => [idx, l]));
            const line = lineMap.get(endIndex) ?? '';
            if (line.endsWith('"')) {
                parts.push(line.slice(0, -1));
                endIndex++;
                break;
            }
            parts.push(line);
            endIndex++;
        }
        return { value: parts.join('\n').replace(/""/g, '"'), endIndex };
    }
    return { value: rawValue, endIndex: startLineIndex + 1 };
}
