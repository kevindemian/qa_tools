/** LLM review pipeline shared types. Extracted from `llm-review.ts` to break circular dependencies. */

export type ArtifactType = 'test-suite' | 'analysis' | 'bug-report' | 'comparison' | 'pipeline';

export interface ReviewResult {
    content: string;
    reviewed: boolean;
    confidence: 'high' | 'medium' | 'low';
    fallbackUsed?: boolean;
    reviewerNotes?: string;
    adversarialRetried?: boolean;
    reReviewTier?: string;
    metrics?: { totalRequests: number; rejectedByValidator: number; retryCount: number };
    artifactType?: ArtifactType;
    layerResults?: {
        layer1Passed: boolean;
        layer2Passed: boolean;
        layer3Passed: boolean;
    };
}

export type ReviewDecision = 'approved' | 'rejected' | 'needs-review';
