/** Structural schema type — accepts any object with a `safeParse` method.
 *  Allows test doubles without casting to `z.ZodType`.
 *  Compatible with both real Zod schemas and test doubles. */
type ZodErrorLike = { issues: Array<{ path: PropertyKey[]; message: string }> };
export type SafeParseSuccess<T> = { success: true; data: T };
export type SafeParseFailure = { success: false; error: ZodErrorLike };
export type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;
export type ZodSchema = {
    safeParse(data: unknown): SafeParseResult<unknown>;
};
export type ZodSchemaTyped<T> = {
    safeParse(data: unknown): SafeParseResult<T>;
};

/** Extract the output type T from a ZodSchema-compatible schema.
 *  Works for both real Zod schemas (discriminated union) and test doubles. */
export type InferSchemaData<S> = S extends { safeParse: (data: unknown) => SafeParseResult<infer T> } ? T : never;

/** LLM provider tier used for routing requests to the appropriate model. */
export type LlmTier = 'main' | 'fast' | 'reviewer' | 'report' | 'fallback' | 'batch';

/** Expected response format from an LLM provider. */
export type ResponseFormat = 'text' | 'json';

/** AI-generated enrichment metadata attached to a bug report. */
export interface LLMEnrichment {
    /** ISO timestamp when enrichment was performed. */
    enrichedAt: string;
    /** Model identifier used for enrichment. */
    model: string;
    /** Suggested code fix, if any. */
    suggestedFix?: string;
    /** Identified root cause description. */
    rootCause?: string;
    /** Confidence score (0-1) of the enrichment. */
    confidence?: number;
}

/** Options for sending a prompt to the LLM. */
export interface LlmPromptOptions<S extends ZodSchema = never> {
    tier: LlmTier;
    system: string;
    user: string;
    callerId?: string;
    responseFormat?: ResponseFormat;
    schema?: S;
}

/** AI generation feedback record. */
export interface AiGenerationRecord {
    id: string;
    generatedAt: string;
    promptVersion: string;
    userStory: string;
    acceptanceCriteria: string;
    generatedTests: Array<{ title: string; preConditions: string[]; stepCount: number }>;
    preconditionMatches: Array<{ summary: string; matchType: string }>;
    feedback?: AiModification[];
}

/** A single AI modification record. */
export interface AiModification {
    testKey: string;
    recordedAt: string;
    action: 'kept' | 'modified' | 'deleted';
    reason?: string;
}
