/**
 * CI injector — non-destructive post-process job injection into ci.yml.
 *
 * Two responsibilities:
 * 1. INJECT: Add a post-process job to an existing ci.yml WITHOUT destroying it
 * 2. GENERATE: Produce the reusable workflow YAML (qa-post-process.yml) dynamically
 *
 * The generated workflow:
 * - Uploads test report artifacts from the external project's test job
 * - Runs shared/pr-report-core.ts which uses DataHub (fetches artifacts via GitHub API)
 * - No CTRF file downloads — DataHub is the SSOT for test data
 *
 * Used by both:
 * - `setup/main.ts` (full setup wizard)
 * - `pr-report-setup-handler.ts` (PR Report config wizard)
 */
import type { SetupContext } from '../setup/context.js';
import { ACTION_VERSIONS } from './test-utils/constants.js';

/* ── Constants ─────────────────────────────────────────────────────────── */

const DEFAULT_TEST_REPORT_PATH = 'reports/';
const DEFAULT_ARTIFACT_NAME = 'test-report';
const NODE_DEFAULT = '22';
const INSTALL_DEFAULT = 'npm ci';

/* ── Public API ────────────────────────────────────────────────────────── */

export interface PostProcessWorkflowOptions {
    projectName: string;
    /** Path to test report files (CTRF/JUnit/Mochawesome). Uploaded as artifact. Default: 'reports/' */
    testReportPath?: string;
    /** Name of the artifact to upload test reports as. Default: 'test-report' */
    artifactName?: string;
    nodeVersion?: string;
    installCmd?: string;
}

/**
 * Generate the reusable workflow YAML for QA Tools post-processing.
 * Written to `.github/workflows/qa-post-process.yml`.
 *
 * The generated workflow:
 * 1. Checks out qa_tools
 * 2. Installs dependencies
 * 3. Runs shared/pr-report-core.ts (DataHub fetches artifacts via GitHub API)
 * 4. Uploads PR report HTML as artifact
 */
export function generatePostProcessWorkflowYaml(options: PostProcessWorkflowOptions): string {
    const testReportPath = options.testReportPath ?? DEFAULT_TEST_REPORT_PATH;
    const artifactName = options.artifactName ?? DEFAULT_ARTIFACT_NAME;
    const nodeVersion = options.nodeVersion ?? NODE_DEFAULT;
    const installCmd = options.installCmd ?? INSTALL_DEFAULT;

    return [
        'name: QA Post-Process',
        '',
        'on:',
        '    workflow_call:',
        '        inputs:',
        '            project-name:',
        '                description: Project name for feature config lookup',
        '                required: true',
        '                type: string',
        '            test-report-path:',
        '                description: Path to test report files (CTRF/JUnit/Mochawesome)',
        '                required: false',
        '                default: ' + testReportPath,
        '                type: string',
        '            artifact-name:',
        '                description: Name of the test report artifact',
        '                required: false',
        '                default: ' + artifactName,
        '                type: string',
        '',
        'permissions:',
        '    contents: read',
        '    actions: read',
        '',
        'jobs:',
        '    post-process:',
        '        runs-on: ubuntu-latest',
        '        steps:',
        `            - uses: ${ACTION_VERSIONS.CHECKOUT}`,
        `            - uses: ${ACTION_VERSIONS.SETUP_NODE}`,
        '              with:',
        '                  node-version: ' + nodeVersion,
        '                  cache: npm',
        '            - name: Install dependencies',
        '              run: ' + installCmd,
        '            - name: Run QA Tools Post-Processing',
        '              if: always()',
        '              run: npx tsx shared/pr-report-core.ts --project ${{ inputs.project-name }}',
        '              env:',
        '                  GITHUB_TOKEN: ${{ github.token }}',
        '            - name: Upload PR Report HTML',
        '              if: always()',
        `              uses: ${ACTION_VERSIONS.UPLOAD_ARTIFACT}`,
        '              with:',
        '                  name: pr-report-html',
        '                  path: reports/pr-report.html',
        '                  if-no-files-found: warn',
    ].join('\n');
}

/**
 * Convenience overload: accept SetupContext (full setup wizard).
 * Maps SetupContext fields to PostProcessWorkflowOptions.
 */
export function generatePostProcessWorkflowFromContext(ctx: SetupContext): string {
    return generatePostProcessWorkflowYaml({
        projectName: ctx.projectName,
        testReportPath: ctx.testReportPath,
        artifactName: ctx.artifactName,
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
    const jobsMatch = /^jobs:\s*$/m.exec(ciYaml);
    if (!jobsMatch) return 'test';

    const afterJobs = ciYaml.slice(jobsMatch.index + jobsMatch[0].length);
    const jobMatch = /^\s{2}([\w-]+):/m.exec(afterJobs);

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
    let trimmed = ciYaml;
    while (
        trimmed.length > 0 &&
        (trimmed.charCodeAt(trimmed.length - 1) === 32 ||
            trimmed.charCodeAt(trimmed.length - 1) === 9 ||
            trimmed.charCodeAt(trimmed.length - 1) === 10 ||
            trimmed.charCodeAt(trimmed.length - 1) === 13)
    ) {
        trimmed = trimmed.slice(0, -1);
    }
    return trimmed + '\n' + postProcessBlock + '\n';
}
