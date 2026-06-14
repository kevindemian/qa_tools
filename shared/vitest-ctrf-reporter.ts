/**
 * CTRF (Common Test Report Format) reporter for vitest.
 *
 * Generates a CTRF JSON report file after each test run, using the same types
 * as `shared/result_parser.ts` for consistency between generation and consumption.
 *
 * Zero external dependencies — implements vitest's Reporter interface directly.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Reporter, TestCase } from 'vitest/node';
import type { CtrfData, CtrfTest } from './result_parser.js';

export interface VitestCtrfReporterOptions {
    /** Output directory for the CTRF report. Default: 'reports' */
    outputDir?: string;
    /** Output filename for the CTRF report. Default: 'ctrf-report.json' */
    outputFile?: string;
    /** Test type (e.g. 'unit', 'integration', 'e2e'). Default: 'unit' */
    testType?: string;
    /** Application name. Default: process.env.APP_NAME || 'qa-tools' */
    appName?: string;
    /** Build name. Default: process.env.BUILD_NAME || process.env.GITHUB_RUN_ID || '' */
    buildName?: string;
    /** Build number. Default: process.env.BUILD_NUMBER || process.env.GITHUB_RUN_NUMBER || '' */
    buildNumber?: string;
    /** Build URL. Default: process.env.BUILD_URL || process.env.GITHUB_SERVER_URL + '/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID */
    buildUrl?: string;
    /** Branch name. Default: process.env.BRANCH_NAME || process.env.GITHUB_REF_NAME || '' */
    branchName?: string;
    /** Repository name. Default: process.env.REPOSITORY_NAME || process.env.GITHUB_REPOSITORY || '' */
    repositoryName?: string;
    /** Whether to generate a minimal report (excludes extra fields). Default: false */
    minimal?: boolean;
}

/**
 * Maps vitest TestCase state to CTRF status string.
 */
function vitestStateToCtrfStatus(state: string): CtrfTest['status'] {
    if (state === 'passed') return 'passed';
    if (state === 'failed') return 'failed';
    if (state === 'skipped') return 'skipped';
    if (state === 'pending') return 'pending';
    return 'other';
}

/**
 * Collection of test results during a single vitest run.
 */
interface CollectedTest {
    name: string;
    status: CtrfTest['status'];
    duration: number;
    message?: string;
    trace?: string;
    suite?: string;
    flaky?: boolean;
    filePath?: string;
    retries?: number;
}

/**
 * Vitest reporter that generates a CTRF JSON report after each test run.
 *
 * Usage in vitest.config.ts:
 * ```ts
 * reporters: ['default', ['./shared/vitest-ctrf-reporter.ts', {
 *   outputDir: 'reports',
 *   outputFile: 'ctrf-report.json',
 * }]],
 * ```
 */
export class VitestCtrfReporter implements Reporter {
    private tests: CollectedTest[] = [];
    private startTime: number = 0;
    private readonly options: Required<VitestCtrfReporterOptions>;

    constructor(options: VitestCtrfReporterOptions = {}) {
        const env = process.env as Record<string, string | undefined>;
        this.options = {
            outputDir: options.outputDir ?? env['CTRF_OUTPUT_DIR'] ?? 'reports',
            outputFile: options.outputFile ?? env['CTRF_OUTPUT_FILE'] ?? 'ctrf-report.json',
            testType: options.testType ?? 'unit',
            appName: options.appName ?? env['APP_NAME'] ?? 'qa-tools',
            buildName: options.buildName ?? env['BUILD_NAME'] ?? env['GITHUB_RUN_ID'] ?? '',
            buildNumber: options.buildNumber ?? env['BUILD_NUMBER'] ?? env['GITHUB_RUN_NUMBER'] ?? '',
            buildUrl:
                options.buildUrl ??
                env['BUILD_URL'] ??
                (env['GITHUB_SERVER_URL'] && env['GITHUB_REPOSITORY'] && env['GITHUB_RUN_ID']
                    ? `${env['GITHUB_SERVER_URL']}/${env['GITHUB_REPOSITORY']}/actions/runs/${env['GITHUB_RUN_ID']}`
                    : ''),
            branchName: options.branchName ?? env['BRANCH_NAME'] ?? env['GITHUB_REF_NAME'] ?? '',
            repositoryName: options.repositoryName ?? env['REPOSITORY_NAME'] ?? env['GITHUB_REPOSITORY'] ?? '',
            minimal: options.minimal ?? false,
        };
    }

    onTestRunStart(): void {
        this.tests = [];
        this.startTime = Date.now();
    }

    onTestCaseResult(testCase: TestCase): void {
        const result = testCase.result();

        // Skip pending tests (not yet finished)
        if (result.state === 'pending') return;

        const diagnostic = testCase.diagnostic();
        const status = vitestStateToCtrfStatus(result.state);
        const duration = diagnostic?.duration ?? 0;

        // Extract first error message and trace if available
        let message: string | undefined;
        let trace: string | undefined;
        if (result.state === 'failed' && 'errors' in result) {
            const errors = result.errors as ReadonlyArray<{ message?: string; stack?: string }> | undefined;
            if (errors && errors.length > 0) {
                message = errors[0]?.message;
                trace = errors[0]?.stack;
            }
        }

        // Build suite hierarchy from parent chain
        const suites: string[] = [];
        let parent: { readonly type: string; readonly name: string; readonly parent: unknown } | undefined =
            testCase.parent as { readonly type: string; readonly name: string; readonly parent: unknown };
        while (parent.type !== 'module') {
            suites.unshift(parent.name);
            parent = parent.parent as typeof parent;
        }

        const suite = suites.length > 0 ? suites.join(' > ') : undefined;

        // A test is flaky if it passed after retries
        const retryCount = diagnostic?.retryCount ?? 0;
        const flaky = status === 'passed' && retryCount > 0 ? true : undefined;

        // File path with line number if available
        const thisModule = testCase.module as { name?: string };
        const location = testCase.location;
        const filePath = location && thisModule.name ? `${thisModule.name}:${location.line}` : undefined;

        const collected: CollectedTest = {
            name: testCase.name,
            status,
            duration,
            ...(message !== undefined ? { message } : {}),
            ...(trace !== undefined ? { trace } : {}),
            ...(suite !== undefined ? { suite } : {}),
            ...(flaky !== undefined ? { flaky } : {}),
            ...(filePath !== undefined ? { filePath } : {}),
            ...(retryCount > 0 ? { retries: retryCount } : {}),
        };

        this.tests.push(collected);
    }

    onTestRunEnd(): void {
        const endTime = Date.now();
        const passed = this.tests.filter((t) => t.status === 'passed').length;
        const failed = this.tests.filter((t) => t.status === 'failed').length;
        const skipped = this.tests.filter((t) => t.status === 'skipped').length;
        const total = this.tests.length;
        const totalDuration = this.tests.reduce((sum, t) => sum + t.duration, 0);

        const tests: CtrfTest[] = this.tests.map((t) => ({
            name: t.name,
            status: t.status,
            duration: t.duration,
            ...(!this.options.minimal && t.message ? { message: t.message } : {}),
            ...(!this.options.minimal && t.trace ? { trace: t.trace } : {}),
            ...(!this.options.minimal && t.suite ? { suite: t.suite } : {}),
            ...(!this.options.minimal && t.flaky ? { flaky: t.flaky } : {}),
            ...(!this.options.minimal && t.filePath ? { filePath: t.filePath } : {}),
            ...(!this.options.minimal && t.retries ? { retries: t.retries } : {}),
            type: this.options.testType,
        }));

        const data: CtrfData = {
            results: {
                tool: { name: 'vitest' },
                summary: {
                    tests: total,
                    passed,
                    failed,
                    skipped,
                    pending: 0,
                    other: 0,
                    start: this.startTime,
                    stop: endTime,
                },
                tests,
                environment: {
                    appName: this.options.appName,
                    buildName: this.options.buildName,
                    buildNumber: this.options.buildNumber,
                },
            },
        };

        // Add extra fields when not in minimal mode
        if (!this.options.minimal && data.results) {
            if (data.results.summary) {
                data.results.summary.duration = totalDuration;
            }
            if (this.options.buildUrl && data.results.environment) {
                (data.results.environment as Record<string, string>)['buildUrl'] = this.options.buildUrl;
            }
            if (this.options.branchName && data.results.environment) {
                (data.results.environment as Record<string, string>)['branchName'] = this.options.branchName;
            }
            if (this.options.repositoryName && data.results.environment) {
                (data.results.environment as Record<string, string>)['repositoryName'] = this.options.repositoryName;
            }
        }

        const outputDir = this.options.outputDir;
        const outputFile = path.resolve(outputDir, this.options.outputFile);

        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf8');
    }
}

export default VitestCtrfReporter;
