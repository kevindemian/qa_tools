/**
 * GitHub Actions reusable workflow for QA Tools post-processing.
 *
 * Called by ci.yml after tests complete. Runs pr-report-core.ts on the
 * CTRF report uploaded by the test job and uploads the resulting HTML.
 */
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
        '      - uses: actions/checkout@v5',
        '      - uses: actions/setup-node@v6',
        '        with:',
        '          node-version: ' + ctx.nodeVersion,
        '          cache: npm',
        '      - name: Install dependencies',
        '        run: ' + ctx.installCmd,
        '      - name: Download CTRF report',
        '        uses: actions/download-artifact@v8',
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
        '          npx tsx shared/pr-report-core.ts --ctrf ${{ inputs.ctrf-path }} --project ${{ inputs.project-name }}',
        '        env:',
        '          GITHUB_TOKEN: ${{ github.token }}',
        '      - name: Upload PR Report HTML',
        '        if: always()',
        '        uses: actions/upload-artifact@v7',
        '        with:',
        '          name: pr-report-html',
        '          path: reports/pr-report.html',
        '          if-no-files-found: warn',
    ].join('\n');
}
