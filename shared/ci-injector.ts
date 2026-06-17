/**
 * CI injector — non-destructive post-process job injection into ci.yml.
 *
 * Two responsibilities:
 * 1. INJECT: Add a post-process job to an existing ci.yml WITHOUT destroying it
 * 2. GENERATE: Produce the reusable workflow YAML (qa-post-process.yml) dynamically
 *
 * Used by both:
 * - `setup/main.ts` (full setup wizard)
 * - `pr-report-setup-handler.ts` (PR Report config wizard)
 */
import type { SetupContext } from '../setup/context.js';

/* ── Constants ─────────────────────────────────────────────────────────── */

const CTRF_DEFAULT = 'reports/ctrf-report.json';
const NODE_DEFAULT = '22';
const INSTALL_DEFAULT = 'npm ci';

/* ── Public API ────────────────────────────────────────────────────────── */

export interface PostProcessWorkflowOptions {
    projectName: string;
    ctrfPath?: string;
    nodeVersion?: string;
    installCmd?: string;
}

/**
 * Generate the reusable workflow YAML for QA Tools post-processing.
 * Written to `.github/workflows/qa-post-process.yml`.
 */
export function generatePostProcessWorkflowYaml(options: PostProcessWorkflowOptions): string {
    const ctrfPath = options.ctrfPath ?? CTRF_DEFAULT;
    const nodeVersion = options.nodeVersion ?? NODE_DEFAULT;
    const installCmd = options.installCmd ?? INSTALL_DEFAULT;

    return [
        'name: QA Post-Process',
        '',
        'on:',
        '  workflow_call:',
        '    inputs:',
        '      project-name:',
        '        description: Project name for feature config lookup',
        '        required: true',
        '        type: string',
        '      ctrf-path:',
        '        description: Path to CTRF report JSON',
        '        required: false',
        '        default: ' + ctrfPath,
        '        type: string',
        '',
        'jobs:',
        '  post-process:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - uses: actions/setup-node@v4',
        '        with:',
        '          node-version: ' + nodeVersion,
        '          cache: npm',
        '      - name: Install dependencies',
        '        run: ' + installCmd,
        '      - name: Download CTRF report',
        '        uses: actions/download-artifact@v4',
        '        with:',
        '          name: ctrf-report',
        '      - name: Run QA Tools Post-Processing',
        '        if: always()',
        '        run: |',
        '          if [ ! -f "${{ inputs.ctrf-path }}" ]; then',
        '            echo "::warning::CTRF report not found at ${{ inputs.ctrf-path }} — skipping post-processing"',
        '            exit 0',
        '          fi',
        '          npx tsx shared/pr-report-core.ts --ctrf ${{ inputs.ctrf-path }} --project ${{ inputs.project-name }}',
        '        env:',
        '          GITHUB_TOKEN: ${{ github.token }}',
        '      - name: Upload PR Report HTML',
        '        if: always()',
        '        uses: actions/upload-artifact@v4',
        '        with:',
        '          name: pr-report-html',
        '          path: reports/pr-report.html',
        '          if-no-files-found: warn',
    ].join('\n');
}

/**
 * Convenience overload: accept SetupContext (full setup wizard).
 */
export function generatePostProcessWorkflowFromContext(ctx: SetupContext): string {
    return generatePostProcessWorkflowYaml({
        projectName: ctx.projectName,
        ctrfPath: ctx.ctrfReportPath,
        nodeVersion: ctx.nodeVersion,
        installCmd: ctx.installCmd,
    });
}

/**
 * Extract the name of the first job defined in ci.yml.
 * Used to populate `needs:` in the injected post-process job.
 *
 * @param ciYaml - Full content of ci.yml
 * @returns The first job name, or `'test'` if none found (safe default)
 */
export function extractFirstJobName(ciYaml: string): string {
    // Match lines like "  jobname:" at the top level under jobs:
    // After the "jobs:" line, capture the first indented key at the same level
    const jobsMatch = ciYaml.match(/^jobs:\s*$/m);
    if (!jobsMatch || jobsMatch.index === undefined) return 'test';

    const afterJobs = ciYaml.slice(jobsMatch.index + jobsMatch[0].length);
    const jobMatch = afterJobs.match(/^\s{2}([\w-]+):/m);

    return jobMatch?.[1] ?? 'test';
}

/**
 * Inject a post-process job into an existing ci.yml string.
 *
 * The injection is NON-DESTRUCTIVE:
 * - Preserves ALL existing content, comments, and structure
 * - Only appends the post-process job block
 * - IDEMPOTENT: if `post-process:` already exists, returns ciYaml unchanged
 *
 * @param ciYaml  - Full content of ci.yml
 * @param projectName - Project name to pass to the reusable workflow
 * @returns Modified ci.yml content with post-process job appended
 */
export function injectPostProcessJob(ciYaml: string, projectName: string): string {
    // Idempotency guard: if post-process job already exists, do nothing
    if (/^\s{2}post-process:/m.test(ciYaml)) return ciYaml;

    const firstJob = extractFirstJobName(ciYaml);
    const needsList = firstJob === 'test' ? '[test]' : `[${firstJob}]`;

    // Build the post-process job YAML block with the same indentation (2 spaces)
    const postProcessBlock = [
        '  post-process:',
        '    if: always()',
        `    needs: ${needsList}`,
        '    uses: ./.github/workflows/qa-post-process.yml',
        '    with:',
        `      project-name: ${projectName}`,
    ].join('\n');

    // Append to the end of the file (preserving trailing content)
    const trimmed = ciYaml.replace(/\s*$/, '');
    return trimmed + '\n' + postProcessBlock + '\n';
}
