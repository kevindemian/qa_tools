const RANGE_PATTERN = /(\d+)\s*(?:and|to|-|through)\s*(\d+)/i;

export function detectNumericRange(input: string): { min: number; max: number } | null {
    const match = RANGE_PATTERN.exec(input);
    if (match) {
        const min = parseInt(match[1] as string, 10);
        const max = parseInt(match[2] as string, 10);
        if (!isNaN(min) && !isNaN(max) && min < max) {
            return { min, max };
        }
    }
    return null;
}
