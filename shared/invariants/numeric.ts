const DIGITS = /\d+/g;

const WORD_CONNECTORS = ['and', 'to', 'through'];

function hasConnector(between: string): boolean {
    const trimmed = between.trim().toLowerCase();
    for (const conn of WORD_CONNECTORS) {
        if (trimmed === conn) return true;
    }
    return trimmed === '-';
}

export function detectNumericRange(input: string): { min: number; max: number } | null {
    const matches: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    while ((m = DIGITS.exec(input)) !== null) {
        matches.push(m);
    }
    if (matches.length < 2) return null;

    for (let k = 0; k < matches.length - 1; k++) {
        const left = matches[k] as RegExpExecArray;
        const right = matches[k + 1] as RegExpExecArray;
        const between = input.slice(left.index + left[0].length, right.index);
        if (hasConnector(between)) {
            const min = Number(left[0]);
            const max = Number(right[0]);
            if (min < max) return { min, max };
        }
    }
    return null;
}
