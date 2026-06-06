/**
 * Targeted retry pattern — multi-layer retry with specific hints.
 *
 * Architecture:
 * - Layer 1 (Schema): retry with Zod validation errors as hints
 * - Layer 2 (Invariants): retry with specific invariant violation IDs + messages
 * - Layer 3 (Semantic): retry with evidence gaps and semantic inconsistencies
 *
 * Each layer has a configurable max retries (default 2).
 * Total max attempts: layer1_max + layer2_max + layer3_max (default 6).
 */

import type { LlmPromptOptions } from './types/llm.js';
import { type ValidationResult, type ValidatorSummary } from './artifact-validator.js';
import { type ZodSchema } from './types.js';
import { recordRetry } from './llm-metrics.js';

export interface LayerConfig {
    maxRetries: number;
    enabled: boolean;
}

export interface RetryConfig {
    layer1: LayerConfig; // Schema validation
    layer2: LayerConfig; // Domain invariants
    layer3: LayerConfig; // Semantic validation
}

export interface RetryResult<T> {
    data: T | null;
    attempts: number;
    layerFailures: Record<string, number>;
    finalErrors: string[];
}

const DEFAULT_CONFIG: RetryConfig = {
    layer1: { maxRetries: 2, enabled: true },
    layer2: { maxRetries: 2, enabled: true },
    layer3: { maxRetries: 2, enabled: true },
};

function buildInvariantHint(results: ValidationResult[]): string {
    const errors = results.filter((r) => !r.passed && r.severity === 'error');
    if (errors.length === 0) return '';
    return errors.map((e) => `- [${e.invariantId}] ${e.message}`).join('\n');
}

/**
 * Attempt generation + multi-layer validation with targeted retry.
 * Each layer retries with increasingly specific hints.
 */
export async function generateWithRetry<T>(
    opts: LlmPromptOptions,
    schema: ZodSchema,
    llmPromptFn: (opts: LlmPromptOptions) => Promise<string>,
    layer2Validator: {
        validate: (
            data: unknown,
            context: { inputRaw: string; outputRaw: unknown; artifactType: string },
        ) => ValidatorSummary;
    },
    layer3Validator: {
        validate: (
            data: unknown,
            context: { inputRaw: string; outputRaw: unknown; artifactType: string },
        ) => ValidatorSummary;
    },
    context: { inputRaw: string; artifactType: string },
    config: RetryConfig = DEFAULT_CONFIG,
): Promise<RetryResult<T>> {
    const attempts: string[] = [];
    const layerFailures: { layer1: number; layer2: number; layer3: number } = { layer1: 0, layer2: 0, layer3: 0 };

    async function tryLayer(system: string, user: string, layer: string, hint: string): Promise<T | null> {
        const hintSystem = hint ? `${system}\n\n[${layer.toUpperCase()} VALIDATION FAILED]\n${hint}` : system;

        try {
            const result = await llmPromptFn({ ...opts, system: hintSystem, user });
            return result as unknown as T;
        } catch {
            return null;
        }
    }

    let system = opts.system;
    const user = opts.user;
    let result: T | null = null;

    // Layer 1: Schema validation
    for (let i = 0; i < config.layer1.maxRetries; i++) {
        result = await tryLayer(system, user, 'layer1', '');
        if (result === null) {
            layerFailures.layer1++;
            recordRetry();
            continue;
        }

        const schemaResult = schema.safeParse(result);
        if (schemaResult.success) {
            break;
        }

        layerFailures.layer1++;
        recordRetry();
        const hints = schemaResult.error.issues
            .map((issue) => `- ${issue.path.join('.')}: ${issue.message}`)
            .join('\n');
        system = `${system}\n\n[SCHEMA VALIDATION FAILED]\nFix these issues:\n${hints}`;
    }

    if (result === null) {
        return {
            data: null,
            attempts: attempts.length,
            layerFailures,
            finalErrors: ['Layer 1: all retries exhausted'],
        };
    }

    const validationCtx = {
        inputRaw: context.inputRaw,
        outputRaw: result,
        artifactType: context.artifactType,
    };

    // Layer 2: Domain invariants
    for (let i = 0; i < config.layer2.maxRetries; i++) {
        const layer2Result = layer2Validator.validate(result, validationCtx);
        if (layer2Result.allPassed) break;

        layerFailures.layer2++;
        recordRetry();
        const hint = buildInvariantHint(layer2Result.results);
        const retryResult = await tryLayer(system, user, 'layer2', hint);
        if (retryResult !== null) {
            result = retryResult;
        }
    }

    // Layer 3: Semantic validation
    for (let i = 0; i < config.layer3.maxRetries; i++) {
        const layer3Result = layer3Validator.validate(result, validationCtx);
        if (layer3Result.allPassed) break;

        layerFailures.layer3++;
        recordRetry();
        const hint = buildInvariantHint(layer3Result.results);
        const retryResult = await tryLayer(system, user, 'layer3', hint);
        if (retryResult !== null) {
            result = retryResult;
        }
    }

    // Final validation check
    const finalLayer2 = layer2Validator.validate(result, validationCtx);
    const finalLayer3 = layer3Validator.validate(result, validationCtx);
    const finalErrors: string[] = [];
    if (!finalLayer2.allPassed) {
        finalErrors.push(
            ...finalLayer2.results
                .filter((r) => !r.passed && r.severity === 'error')
                .map((r) => `${r.invariantId}: ${r.message}`),
        );
    }
    if (!finalLayer3.allPassed) {
        finalErrors.push(
            ...finalLayer3.results
                .filter((r) => !r.passed && r.severity === 'error')
                .map((r) => `${r.invariantId}: ${r.message}`),
        );
    }

    return {
        data: finalErrors.length === 0 ? result : null,
        attempts: attempts.length,
        layerFailures,
        finalErrors,
    };
}
