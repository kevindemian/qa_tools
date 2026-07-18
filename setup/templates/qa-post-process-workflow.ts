/**
 * GitHub Actions reusable workflow for QA Tools post-processing.
 *
 * Called by ci.yml after tests complete. Runs git_triggers/main.ts pr-report on the
 * test report uploaded by the test job and uploads the resulting HTML.
 */
import { ACTION_VERSIONS } from '../../shared/test-utils/constants.js';
import type { SetupContext } from '../context.js';

export function generateQaPostProcessWorkflow(ctx: SetupContext): string {
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
        '                default: reports/',
        '                type: string',
        '            artifact-name:',
        '                description: Name of the test report artifact',
        '                required: false',
        '                default: ' + ctx.artifactName,
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
        '                  node-version: ' + ctx.nodeVersion,
        '                  cache: npm',
        '            - name: Install dependencies',
        '              run: ' + ctx.installCmd,
        '            - name: Run QA Tools Post-Processing',
        '              if: always()',
        '              run: npx tsx git_triggers/main.ts pr-report --project ${{ inputs.project-name }}',
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
