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
