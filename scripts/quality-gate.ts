/** qa-quality-gate CLI — evaluates health, coverage, flakiness thresholds and exits with 0/1.
 *  Usage: npx tsx scripts/quality-gate.ts [--json] [--project <name>]
 *  Environment: QA_GATE_MIN_PASS_RATE, QA_GATE_MAX_FLAKY_PCT, QA_GATE_MIN_COVERAGE, QA_GATE_MAX_SUITE_SPEED */
import { runQualityGate, formatQualityGateJson, formatQualityGateText } from '../shared/quality-gate.js';

function parseArgs(): { json: boolean; project: string | undefined } {
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const projectIdx = args.indexOf('--project');
    const project = projectIdx >= 0 && projectIdx + 1 < args.length ? args[projectIdx + 1] : undefined;
    return { json, project };
}

function main(): void {
    const { json, project } = parseArgs();
    const result = runQualityGate(project ? { project } : undefined);
    if (json) {
        process.stdout.write(formatQualityGateJson(result));
    } else {
        process.stdout.write(formatQualityGateText(result));
    }
    process.exit(result.overall === 'pass' ? 0 : 1);
}

try {
    main();
} catch (err) {
    process.stderr.write('Fatal error: ' + (err instanceof Error ? err.message : String(err)) + '\n');
    process.exit(1);
}
