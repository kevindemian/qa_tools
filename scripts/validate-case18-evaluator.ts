#!/usr/bin/env node
/**
 * Validate case18 evaluator against ECSPOL-960 baseline.
 * Imports the evaluator directly via tsx.
 */
import { evaluateCase18, generateEvaluationReport } from '../shared/quality/case18-evaluator.js';
import { ECSPOL960_BASELINE, ECSPOL960_STORY } from '../shared/quality/case18-benchmarks.js';

console.log('=== Case18 Evaluator — ECSPOL-960 Validation ===\n');

const result = evaluateCase18(ECSPOL960_BASELINE, ECSPOL960_STORY.description);

console.log('Overall Score: ' + result.score + '/100 (Grade: ' + result.grade + ')\n');

console.log('--- Per-Metric Breakdown ---');
for (const [key, metric] of Object.entries(result.layers.deterministic.metrics)) {
    console.log('  ' + key.padEnd(25) + metric.score + '% (weight: ' + metric.weight + ')');
    for (const p of metric.passed) console.log('    ✓ ' + p);
    for (const f of metric.failed) console.log('    ✗ ' + f);
    for (const w of metric.warnings) console.log('    ⚠ ' + w);
}

console.log('\n--- Passed (' + result.details.passed.length + ') ---');
for (const p of result.details.passed) console.log('  ✓ ' + p);

console.log('\n--- Failed (' + result.details.failed.length + ') ---');
for (const f of result.details.failed) console.log('  ✗ ' + f);

console.log('\n--- Warnings (' + result.details.warnings.length + ') ---');
for (const w of result.details.warnings) console.log('  ⚠ ' + w);

// Generate HTML report
const html = generateEvaluationReport(result, ECSPOL960_STORY.description);
const fs = await import('fs');
const reportPath = '/tmp/case18-evaluation-report.html';
fs.writeFileSync(reportPath, html);
console.log('\nHTML report saved to: ' + reportPath);
