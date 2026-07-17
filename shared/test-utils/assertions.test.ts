import { describe, it, expect, vi } from 'vitest';
import { assertNullOr } from './assertions.js';

describe('AssertNullOr', () => {
    it('calls the assert callback with the value when it is present', () => {
        expect.assertions(2);

        const assert = vi.fn();
        const onNull = vi.fn();

        assertNullOr('present', assert, onNull);

        expect(assert).toHaveBeenCalledWith('present');
        expect(onNull).not.toHaveBeenCalled();
    });

    it('calls the assert callback for falsy-but-present values (0, empty string, false)', () => {
        expect.assertions(3);

        const zero = vi.fn();
        const empty = vi.fn();
        const falsy = vi.fn();

        assertNullOr(0, zero);
        assertNullOr('', empty);
        assertNullOr(false, falsy);

        expect(zero).toHaveBeenCalledWith(0);
        expect(empty).toHaveBeenCalledWith('');
        expect(falsy).toHaveBeenCalledWith(false);
    });

    it('calls onNull (not assert) when the value is null', () => {
        expect.assertions(2);

        const assert = vi.fn();
        const onNull = vi.fn();

        assertNullOr(null, assert, onNull);

        expect(onNull).toHaveBeenCalledTimes(1);
        expect(assert).not.toHaveBeenCalled();
    });

    it('calls onNull (not assert) when the value is undefined', () => {
        expect.assertions(2);

        const assert = vi.fn();
        const onNull = vi.fn();

        assertNullOr(undefined, assert, onNull);

        expect(onNull).toHaveBeenCalledTimes(1);
        expect(assert).not.toHaveBeenCalled();
    });

    it('is a no-op when the value is null and no onNull handler is provided', () => {
        expect.assertions(1);

        const assert = vi.fn();

        expect(() => assertNullOr(null, assert)).not.toThrow();
    });

    it('is a no-op when the value is undefined and no onNull handler is provided', () => {
        expect.assertions(2);

        const assert = vi.fn();

        expect(() => assertNullOr(undefined, assert)).not.toThrow();
        expect(assert).not.toHaveBeenCalled();
    });
});
