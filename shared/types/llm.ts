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
    /** Content hash of the prompt template used (tracks prompt evolution). */
    promptVersion?: string;
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

/** Per-metric breakdown persisted for the calibration loop (calibrates prompts/schemas). */
export interface AiQualityMetric {
    score: number;
    weight: number;
    failed: string[];
    warnings: string[];
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
    /** Quality score of the deterministic floor (0-100). Present when the
     *  case18 evaluator runs. Absent on early-abort paths or other generators. */
    qualityScore?: number;
    /** Grade from the deterministic floor (A-F). Present when qualityScore is. */
    qualityGrade?: 'A' | 'B' | 'C' | 'D' | 'F';
    /** Per-metric deterministic breakdown (coverage, BVA, EP, ...). Present when
     *  qualityScore is. Drives the prompt/schema calibration loop. */
    qualityMetrics?: Record<string, AiQualityMetric>;
    /** Outcome of the human quality gate. `regenerated` marks an attempt that
     *  was superseded by a user-chosen re-generation; `created`/`rejected` are final. */
    gateAction?: 'created' | 'regenerated' | 'rejected';
    /** 1-based generation attempt number for this user story within this run. */
    attempt?: number;
}

/** A single AI modification record. */
export interface AiModification {
    testKey: string;
    recordedAt: string;
    action: 'kept' | 'modified' | 'deleted';
    reason?: string;
}
