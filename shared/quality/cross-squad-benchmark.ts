/**
 * Cross-Squad Benchmark — rendering entry point.
 *
 * The calculation `computeCrossSquadBenchmark` + `BENCHMARK_PROVENANCE` moved
 * to `shared/data-hub/compute/cross-squad-benchmark.ts` (F0.3 — hub-first
 * compute layer). This module preserves the HTML renderer re-export until the
 * renderer is removed in a later phase; no calculation lives here.
 *
 * @module cross-squad-benchmark
 */

export { generateBenchmarkHtml } from './cross-squad-benchmark-renderer.js';
