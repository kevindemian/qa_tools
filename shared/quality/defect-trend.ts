/**
 * Defect Trend Dashboard — renderer barrel.
 *
 * The aggregation (aggregateDefectTrends) lives in
 * `shared/data-hub/compute/defect-aggregation.ts` (SSOT). This module
 * re-exports only the HTML renderer; consumers requiring the aggregation
 * import it from the compute module.
 *
 * @module defect-trend
 */

export { generateDefectTrendHtml } from './defect-trend-renderer.js';
