/**
 * AI Test Effectiveness Comparison — rendering entry point.
 *
 * The calculation `compareAiVsManual` moved to
 * `shared/data-hub/compute/ai-comparison.ts` (F0.3 — hub-first compute layer).
 * This module preserves the HTML renderer re-export until the renderer is
 * removed in a later phase; no calculation lives here.
 *
 * @module ai-comparison
 */

export { generateAiComparisonHtml } from './ai-comparison-renderer.js';
