export function assertNullOr<T>(value: T | null | undefined, assert: (v: T) => void, onNull?: () => void): void {
    if (value != null) {
        assert(value);
    } else if (onNull) {
        onNull();
    }
}

export function containsEmoji(text: string): boolean {
    for (const ch of text) {
        const code = ch.codePointAt(0);
        if (code == null) continue;
        if ((code >= 0x1f000 && code <= 0x1faff) || (code >= 0x2600 && code <= 0x27bf)) {
            return true;
        }
    }
    return false;
}
