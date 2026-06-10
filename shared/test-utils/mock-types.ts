/**
 * mock-types.ts — Type-safe mock utilities with explicit `this: void`
 *
 * vitest's Mocked<T> preserves the original `this` parameter via `& T`,
 * causing @typescript-eslint/unbound-method false positives when mock
 * methods are passed as callbacks (expect, vi.mocked, etc.).
 *
 * MockedSafe<T> replaces the original method call signature with an
 * equivalent one that declares `this: void`. This is factually correct
 * because mock functions never access `this`. The result is full
 * compatibility with the unbound-method safety rule.
 *
 * Usage:
 *   const client = mockedSafe(provider.client);
 *   client.get.mockResolvedValue(data);           // ✓ no error
 *   expect(client.get).toHaveBeenCalledWith(...); // ✓ no error
 */

import type { MockInstance } from 'vitest';
import type { AxiosInstance } from 'axios';

/**
 * MockedSafe<T> is identical to vitest's Mocked<T> in runtime behavior,
 * but replaces all method call signatures with `this: void`.
 *
 * Unlike Mocked<T> which does `MockInstance<T[K]> & T[K]` (preserving
 * the original `this: T`), MockedSafe<T> does:
 *   `(this: void, ...args) => R & MockInstance<T[K]>`
 *
 * This satisfies @typescript-eslint/unbound-method because every
 * call signature declares `this: void`.
 */
export type MockedSafe<T> = {
    [K in keyof T]: T[K] extends (...args: infer A) => infer R
        ? ((this: void, ...args: A) => R) & MockInstance<T[K]>
        : T[K] extends object
          ? MockedSafe<T[K]>
          : T[K];
};

/**
 * Casts an already-mocked object to MockedSafe<T>.
 * This is a safe type-level cast: the object IS a mock at runtime,
 * and we're only correcting the TypeScript type to include `this: void`.
 *
 * Usage:
 *   const client = mockedSafe(provider.client);
 *   client.get.mockResolvedValue(data);           // instead of vi.mocked(provider.client.get)
 *   expect(client.get).toHaveBeenCalledWith(...);  // instead of expect(provider.client.get)
 */
export function mockedSafe<T extends object>(obj: T): MockedSafe<T> {
    return obj as unknown as MockedSafe<T>;
}

/**
 * Convenience export: a pre-typed mock AxiosInstance.
 * Use in TestProvider classes to override the base class type.
 */
export type MockedAxiosInstance = MockedSafe<AxiosInstance>;
