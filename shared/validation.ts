/**
 * Validation layer — wraps zod for dependency isolation.
 *
 * All runtime validation schemas must import from here instead of directly from 'zod'.
 * This allows swapping the validation library without touching 18+ schema files.
 *
 * @module validation
 */
export { z } from 'zod';
export type {
    ZodSchema,
    ZodType,
    ZodString,
    ZodNumber,
    ZodBoolean,
    ZodObject,
    ZodArray,
    ZodEnum,
    ZodUnion,
    ZodOptional,
    ZodNullable,
    ZodError,
    ZodRawShape,
    ZodTypeAny,
    ZodFirstPartyTypeKind,
} from 'zod';

/** Parse and throw on failure — convenience wrapper. */
export function parseOrThrow<T>(schema: import('zod').ZodSchema<T>, data: unknown): T {
    const result = schema.safeParse(data);
    if (!result.success) {
        throw new Error(`Validation failed: ${result.error.message}`);
    }
    return result.data;
}
