/**
 * mock-types.ts — Mock utilities with explicit `this: void`
 *
 * ## Problem
 *
 * vitest's Mocked<T> = MockedObject<T> & T. The `& T` preserves the
 * original `this: T` on every method, causing @typescript-eslint/
 * unbound-method false positives when mock methods are passed as
 * callbacks (expect, vi.mocked, etc.). This affects ~313 occurrences
 * across ~45 test files.
 *
 * ## Solution — MockedSafe<T>
 *
 * MockedSafe<T> is a mapped type that replaces each method's original
 * call signature with `(this: void, ...args) => R`, adding MockInstance
 * for vitest mock API access. Unlike vitest's Mocked<T>, it does NOT
 * include `& T`, so `this` is explicitly void.
 *
 * ## Limitation (IMPORTANT)
 *
 * MockedSafe<T> CANNOT replace Mocked<T> as a factory return type when
 * T has generic methods (e.g., `<T = JsonObject>(url: string) => Promise<T>`).
 * TypeScript's conditional type inference (`infer A` / `infer R`) resolves
 * generic type parameters to `unknown`, producing `Promise<unknown>` instead
 * of `Promise<T>`. This causes TSC errors wherever the mock is assigned
 * back to the original type.
 *
 * This is a FUNDAMENTAL limitation of TypeScript mapped types — generic
 * type parameters on methods are erased through inference. vitest's
 * Mocked<T> works around this by adding `& T` (preserving the original
 * call signature with generics), but at the cost of bringing back `this: T`.
 *
 * ## Usage
 *
 * MockedSafe<T> works correctly when applied at the CONSUMER level to an
 * already-mocked object (not as a factory return type):
 *
 *   const logger = mockedSafe(vi.mocked(loggerModule));
 *   logger.info.mockResolvedValue(undefined);  // ✓ MockInstance preserved
 *   expect(logger.info).toHaveBeenCalled();     // ✓ no unbound-method
 *
 * It also works for any mock object whose methods do NOT have generic
 * type parameters.
 *
 * ## About the 313 unbound-method false positives
 *
 * As of Jun/2026, the ~313 unbound-method errors in this codebase are
 * FALSE POSITIVES caused by vitest's `Mocked<T>` type design. They cannot
 * be fixed at the source level without:
 *   - Breaking generic type inference (MockedSafe<T> as factory type)
 *   - Weakening eslint rules (forbidden by safety mechanism)
 *   - Suppressing the rule (forbidden by safety mechanism)
 *
 * These are accepted as a known limitation. The errors are harmless
 * because the mocked methods are vi.fn() instances that never access `this`.
 *
 * @see handlers.test.ts for a valid usage example.
 */

import type { MockInstance } from 'vitest';
import type { AxiosInstance } from 'axios';

/**
 * Mapped type that replaces every call signature in T with `this: void`.
 *
 * Unlike vitest's Mocked<T> (= MockedObject<T> & T), this type does NOT
 * include `& T`, so the original `this: T` is stripped from all methods.
 *
 * LIMITATION: Generic type parameters on methods are lost through
 * conditional type inference. See module-level docs for details.
 */
export type MockedSafe<T> = {
    [K in keyof T]: T[K] extends (...args: infer A) => infer R
        ? ((this: void, ...args: A) => R) & MockInstance<T[K]>
        : T[K] extends object
          ? MockedSafe<T[K]>
          : T[K];
};

type MockedSafeFunction<T extends (...args: unknown[]) => unknown> = ((
    this: void,
    ...args: Parameters<T>
) => ReturnType<T>) &
    MockInstance<T>;

type MockedSafeResult<T> = T extends (...args: unknown[]) => unknown ? MockedSafeFunction<T> : MockedSafe<T>;

/**
 * Wraps an already-mocked object, returning it with `this: void`.
 *
 * Use at the CONSUMER level, not as a factory return type (see module docs).
 * Works correctly for objects without generic methods.
 *
 * @example
 *   const logger = mockedSafe(vi.mocked(loggerModule));
 *   logger.info.mockResolvedValue(undefined);
 *   expect(logger.info).toHaveBeenCalled();
 */
export function mockedSafe<T>(obj: T): MockedSafeResult<T> {
    return obj as unknown as MockedSafeResult<T>;
}

/**
 * Convenience export: a pre-typed mock AxiosInstance.
 * Use in TestProvider classes to override the base class type.
 */
export type MockedAxiosInstance = MockedSafe<AxiosInstance>;
