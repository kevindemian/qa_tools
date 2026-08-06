/**
 * Silent Regression Detector — renderer barrel.
 *
 * The detection logic (detectSilentRegressions) and the z-score provenance
 * live in `shared/data-hub/compute/regression-detection.ts` (SSOT). This
 * module re-exports only the HTML renderer and the provenance constant;
 * consumers requiring the detection import it from the compute module.
 *
 * @module silent-regression
 */

export { generateSilentRegressionHtml } from './silent-regression-renderer.js';
export { SILENT_REGRESSION_PROVENANCE } from '../data-hub/compute/regression-detection.js';
