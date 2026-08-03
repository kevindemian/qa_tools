/**
 * Defect Seasonality Dashboard — renderer barrel.
 *
 * The aggregation (aggregateDefectSeasonality) lives in
 * `shared/data-hub/compute/defect-aggregation.ts` (SSOT). This module
 * re-exports only the HTML renderer; consumers requiring the aggregation
 * import it from the compute module.
 *
 * @module defect-seasonality
 */

export { generateSeasonalityHtml } from './defect-seasonality-renderer.js';
