import { describe, it, expect, vi } from 'vitest';
import { assertNullOr, containsEmoji } from '../assertions.js';

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

describe('ContainsEmoji', () => {
    it('returns true when the text contains an emoji in the supplementary range (astral plane)', () => {
        expect.assertions(2);

        expect(containsEmoji('status passed \u{1F600}')).toBeTruthy();
        expect(containsEmoji('\u{1F512} completed')).toBeTruthy();
    });

    it('returns true for emoji in the 2600-27BF block', () => {
        expect.assertions(2);

        expect(containsEmoji('\u2764')).toBeTruthy();
        expect(containsEmoji('warn \u26A0')).toBeTruthy();
    });

    it('returns false for plain ASCII text without emoji', () => {
        expect.assertions(1);

        expect(containsEmoji('recent commits - fix login')).toBeFalsy();
    });

    it('returns false for an empty string', () => {
        expect.assertions(1);

        expect(containsEmoji('')).toBeFalsy();
    });

    it('returns false for text with only non-emoji unicode symbols (arrows, geometric shapes)', () => {
        expect.assertions(3);

        expect(containsEmoji('\u2192 direction')).toBeFalsy();
        expect(containsEmoji('\u25B6')).toBeFalsy();
        expect(containsEmoji('a \u00E9')).toBeFalsy();
    });
});
