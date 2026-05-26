const PRECONDITION_KEY_PATTERN = '[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*\\-\\d+';

const PRECONDITION_KEY_RE = new RegExp('^' + PRECONDITION_KEY_PATTERN + '$');

export function isPreconditionKey(value: string): boolean {
    return PRECONDITION_KEY_RE.test(value);
}

export function extractPreconditionKey(value: string): string | null {
    const match = value.match(new RegExp('^(' + PRECONDITION_KEY_PATTERN + ')'));
    return match ? match[1]! : null;
}

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
            const line = lines[endIndex]!;
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
