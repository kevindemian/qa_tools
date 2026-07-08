export function assertNullOr<T>(value: T | null | undefined, assert: (v: T) => void, onNull?: () => void): void {
    if (value != null) {
        assert(value);
    } else if (onNull) {
        onNull();
    }
}
