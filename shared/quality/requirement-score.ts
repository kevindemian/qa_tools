/**
 * Requirement Quality Score — rendering entry point.
 *
 * The calculation `calculateRequirementScores` moved to
 * `shared/data-hub/compute/requirement-score.ts` (F0.3 — hub-first compute
 * layer). This module preserves the HTML renderer re-export until the renderer
 * is removed in a later phase; no calculation lives here.
 *
 * @module requirement-score
 */

export { generateRequirementScoreHtml } from './requirement-score-renderer.js';
