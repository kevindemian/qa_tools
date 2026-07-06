/**
 * GitHub Actions reusable workflow for QA Tools post-processing.
 *
 * Called by ci.yml after tests complete. Runs pr-report-core.ts on the
 * CTRF report uploaded by the test job and uploads the resulting HTML.
 */
import { ACTION_VERSIONS } from '../../shared/test-utils/constants.js';
import type { SetupContext } from '../context.js';

export function generateQaPostProcessWorkflow(ctx: SetupContext): string {
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
        '        default: reports/ctrf-report.json',
        '        type: string',
        '',
        'jobs:',
        '  post-process:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        `      - uses: ${ACTION_VERSIONS.CHECKOUT}`,
        `      - uses: ${ACTION_VERSIONS.SETUP_NODE}`,
        '        with:',
        '          node-version: ' + ctx.nodeVersion,
        '          cache: npm',
        '      - name: Install dependencies',
        '        run: ' + ctx.installCmd,
        '      - name: Download CTRF report',
        `        uses: ${ACTION_VERSIONS.DOWNLOAD_ARTIFACT}`,
        '        with:',
        '          name: ctrf-report',
        '          path: reports/',
        '      - name: Run QA Tools Post-Processing',
        '        if: always()',
        '        run: |',
        '          if [ ! -f "${{ inputs.ctrf-path }}" ]; then',
        '            echo "::warning::CTRF report not found at ${{ inputs.ctrf-path }} — skipping post-processing"',
        '            exit 0',
        '          fi',
        '          npx tsx git_triggers/pr-report-entry.ts --ctrf ${{ inputs.ctrf-path }} --project ${{ inputs.project-name }}',
        '        env:',
        '          GITHUB_TOKEN: ${{ github.token }}',
        '      - name: Upload PR Report HTML',
        '        if: always()',
        `        uses: ${ACTION_VERSIONS.UPLOAD_ARTIFACT}`,
        '        with:',
        '          name: pr-report-html',
        '          path: reports/pr-report.html',
        '          if-no-files-found: warn',
    ].join('\n');
}
