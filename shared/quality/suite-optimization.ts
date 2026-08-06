/**
 * Suite Optimization Advisor — renderer barrel.
 *
 * The classification logic (computeOptimizationActions) lives in
 * `shared/data-hub/compute/optimization-actions.ts` (SSOT). This module
 * re-exports only the HTML renderer; consumers requiring the classification
 * import it from the compute module.
 *
 * @module suite-optimization
 */

export { generateOptimizationHtml } from './suite-optimization-renderer.js';
