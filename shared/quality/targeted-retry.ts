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

import type { LlmPromptOptions } from '../types/llm.js';
import { type ValidationResult, type ValidatorSummary } from '../validation/artifact-validator.js';
import { type ZodSchemaTyped } from '../types.js';
import { recordRetry } from '../llm/llm-metrics.js';
import { rootLogger } from '../logger.js';

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

function buildSchemaHint(schemaResult: { error: { issues: Array<{ path: PropertyKey[]; message: string }> } }): string {
    return schemaResult.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`).join('\n');
}

function collectInvariantErrors(summary: ValidatorSummary): string[] {
    if (summary.allPassed) return [];
    return summary.results
        .filter((r) => !r.passed && r.severity === 'error')
        .map((r) => `${r.invariantId}: ${r.message}`);
}

/**
 * Attempt generation + multi-layer validation with targeted retry.
 * Each layer retries with increasingly specific hints.
 */
export async function generateWithRetry<T>(
    opts: LlmPromptOptions,
    schema: ZodSchemaTyped<T>,
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
    let attempts = 0;
    const layerFailures: { layer1: number; layer2: number; layer3: number } = { layer1: 0, layer2: 0, layer3: 0 };

    async function tryLayer(system: string, user: string, layer: string, hint: string): Promise<T | null> {
        const hintSystem = hint ? `${system}\n\n[${layer.toUpperCase()} VALIDATION FAILED]\n${hint}` : system;

        attempts++;
        try {
            const result = await llmPromptFn({ ...opts, system: hintSystem, user });
            const parsed = schema.safeParse(result);
            if (parsed.success) return parsed.data;
            return null;
        } catch (err) {
            rootLogger.warn('targeted-retry: LLM + schema parsing failed: ' + String(err));
            return null;
        }
    }

    async function runLayer1(): Promise<{ result: T | null; updatedSystem: string; failed: boolean }> {
        let sys = opts.system;
        const user = opts.user;
        for (let i = 0; i < config.layer1.maxRetries; i++) {
            const attempt = await tryLayer(sys, user, 'layer1', '');
            if (attempt !== null) {
                const schemaResult = schema.safeParse(attempt);
                if (schemaResult.success) return { result: attempt, updatedSystem: sys, failed: false };
                layerFailures.layer1++;
                recordRetry();
                sys = `${sys}\n\n[SCHEMA VALIDATION FAILED]\nFix these issues:\n${buildSchemaHint(schemaResult)}`;
            } else {
                layerFailures.layer1++;
                recordRetry();
            }
        }
        return { result: null, updatedSystem: sys, failed: true };
    }

    async function runInvariantLayer(
        currentResult: T,
        currentSystem: string,
        layer: 'layer2' | 'layer3',
        validator: {
            validate: (
                data: unknown,
                ctx: { inputRaw: string; outputRaw: unknown; artifactType: string },
            ) => ValidatorSummary;
        },
    ): Promise<T> {
        const maxRetries = config[layer].maxRetries;
        let result = currentResult;
        for (let i = 0; i < maxRetries; i++) {
            const summary = validator.validate(result, validationCtx);
            if (summary.allPassed) break;
            layerFailures[layer]++;
            recordRetry();
            const hint = buildInvariantHint(summary.results);
            const retryResult = await tryLayer(currentSystem, opts.user, layer, hint);
            if (retryResult !== null) result = retryResult;
        }
        return result;
    }

    const layer1Outcome = await runLayer1();
    const system = layer1Outcome.updatedSystem;
    let result: T | null = layer1Outcome.result;

    if (layer1Outcome.failed) {
        return {
            data: null,
            attempts,
            layerFailures,
            finalErrors: ['Layer 1: all retries exhausted'],
        };
    }

    if (result === null) {
        return {
            data: null,
            attempts,
            layerFailures,
            finalErrors: ['Layer 1: result is null after retries'],
        };
    }

    const validationCtx = {
        inputRaw: context.inputRaw,
        outputRaw: result,
        artifactType: context.artifactType,
    };

    result = await runInvariantLayer(result, system, 'layer2', layer2Validator);
    result = await runInvariantLayer(result, system, 'layer3', layer3Validator);

    const finalErrors = [
        ...collectInvariantErrors(layer2Validator.validate(result, validationCtx)),
        ...collectInvariantErrors(layer3Validator.validate(result, validationCtx)),
    ];

    return {
        data: finalErrors.length === 0 ? result : null,
        attempts,
        layerFailures,
        finalErrors,
    };
}
