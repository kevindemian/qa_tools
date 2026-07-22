/** Mock facade auditor — flags test files that mock I/O (child_process, fs)
 *  and are never exercised against real code.
 *
 *  Categories:
 *   1. vi.mock('child_process') — never runs real commands
 *   2. vi.mock('fs') — never touches real filesystem
 *   3. Integration tests that still mock everything (defeats purpose)
 *   4. Production code with no real integration test (only mock tests)
 *   5. execFileSync mocks with output format mismatch (like the vitest bug)
 *
 *  Run: npx ts-node scripts/audit/mock-facade.ts
 *       npx ts-node scripts/audit/mock-facade.ts --json  (machine-readable)
 *       npx ts-node scripts/audit/mock-facade.ts --fail  (exit 1 on high)
 */
import fs from 'node:fs';
import path from 'node:path';
import { rootLogger } from '../../shared/logger.js';

const ROOT = path.resolve(import.meta.dirname, '../..');

type Severity = 'high' | 'medium' | 'low';

interface Finding {
    category: string;
    severity: Severity;
    count: number;
    fileCount: number;
    description: string;
    files: string[];
    recommendation: string;
}

/* ── File tree helpers ──────────────────────────────────────────── */

function* walk(dir: string): Generator<string> {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== '.audit') {
                    yield* walk(full);
                }
            } else {
                yield full;
            }
        }
    } catch (err) {
        rootLogger.warn(`[mock-facade] walk: skipping inaccessible path: ${String(err)}`);
    }
}

function listTestFiles(): string[] {
    const result: string[] = [];
    for (const f of walk(ROOT)) {
        if (f.endsWith('.test.ts')) result.push(f);
    }
    return result;
}

function listSourceFiles(): string[] {
    const dirs = ['shared', 'scripts', 'jira_management', 'git_triggers', 'setup', 'e2e'];
    const result: string[] = [];
    for (const d of dirs) {
        const fullDir = path.join(ROOT, d);
        if (!fs.existsSync(fullDir)) continue;
        for (const f of walk(fullDir)) {
            if (
                f.endsWith('.ts') &&
                !f.endsWith('.test.ts') &&
                !f.endsWith('.d.ts') &&
                !f.endsWith('.property.test.ts')
            ) {
                result.push(f);
            }
        }
    }
    return result;
}

function isIntegrationOrE2e(filePath: string): boolean {
    const rel = path.relative(ROOT, filePath);
    return rel.startsWith('e2e/') || rel.includes('/integration/') || rel.includes('integration.');
}

/* ── Detection ──────────────────────────────────────────────────── */

function buildCategoryRecommendation(
    matchedCount: number,
    integrationCount: number,
    label: string,
    integrationFiles: string[],
): string {
    if (matchedCount === 0) return 'No issues found.';
    if (integrationCount > 0) {
        return `Remove mocks from integration/e2e tests: ${integrationFiles.slice(0, 5).join(', ')}. Create __mocks__/${label}.ts for unit tests.`;
    }
    return `Add real integration tests that exercise ${label}. Create __mocks__/${label}.ts for unit tests.`;
}

function detectCategory(
    category: string,
    label: string,
    mockPattern: string,
    includeIntegrationCheck: boolean,
    severityHigh: Severity,
): Finding {
    const files = listTestFiles();
    const matched: string[] = [];
    const integrationMatched: string[] = [];

    for (const f of files) {
        const content = fs.readFileSync(f, 'utf8');
        if (content.includes(mockPattern)) {
            matched.push(f);
            if (includeIntegrationCheck && isIntegrationOrE2e(f)) {
                integrationMatched.push(f);
            }
        }
    }

    let severity: Severity = 'low';
    if (matched.length > 0) {
        severity = integrationMatched.length > 0 ? 'high' : severityHigh;
    }

    const descParts: string[] = [`${matched.length} test files mock ${label}.`];
    if (integrationMatched.length > 0) {
        descParts.push(`${integrationMatched.length} are integration/e2e files that should not mock.`);
    }

    return {
        category,
        severity,
        count: matched.length,
        fileCount: matched.length,
        description: descParts.join(' '),
        files: matched,
        recommendation: buildCategoryRecommendation(
            matched.length,
            integrationMatched.length,
            label,
            integrationMatched,
        ),
    };
}

function detectChildProcessMocks(): Finding {
    return detectCategory('child_process_mock', 'child_process', "vi.mock('child_process'", true, 'medium');
}

function detectFsMocks(): Finding {
    return detectCategory('fs_mock', 'fs', "vi.mock('fs'", true, 'medium');
}

function detectLoggerMocks(): Finding {
    return detectCategory('logger_mock', 'logger (rootLogger)', "vi.mock('./logger'", false, 'low');
}

function detectIntegrationMocks(): Finding {
    const files = listTestFiles().filter((f) => isIntegrationOrE2e(f));
    const withMocks: string[] = [];

    for (const f of files) {
        const content = fs.readFileSync(f, 'utf8');
        const mockCount = (content.match(/vi\.mock\(/g) || []).length;
        if (mockCount > 0) {
            withMocks.push(`${path.relative(ROOT, f)} (${mockCount} mock(s))`);
        }
    }

    return {
        category: 'integration_test_mocks',
        severity: withMocks.length > 0 ? 'high' : 'low',
        count: withMocks.length,
        fileCount: withMocks.length,
        description: `${withMocks.length} integration/e2e test files use vi.mock() — they test mocks, not real behavior.`,
        files: withMocks,
        recommendation:
            withMocks.length > 0
                ? 'Remove mocks from integration tests. Use real filesystem (tmpdir) and real commands. Only mock network for e2e.'
                : 'No issues found.',
    };
}

function getMatchingE2eFiles(base: string): string[] {
    const e2eDir = path.join(ROOT, 'e2e');
    if (!fs.existsSync(e2eDir)) return [];
    return fs
        .readdirSync(e2eDir)
        .filter((f) => f.includes(base.replace(/-/g, '-')) || base.includes(f.replace('.test.ts', '')))
        .map((f) => path.join(e2eDir, f));
}

function checkMockOnlyUnitTest(unitTestFile: string, testFiles: Set<string>): string | null {
    if (!testFiles.has(unitTestFile)) return null;
    const testContent = fs.readFileSync(unitTestFile, 'utf8');
    const mocksIo =
        testContent.includes("vi.mock('child_process'") ||
        testContent.includes('vi.mock("child_process"') ||
        testContent.includes("vi.mock('fs'") ||
        testContent.includes('vi.mock("fs"');
    if (!mocksIo) return null;
    const testCount = (testContent.match(/^[ \t]*(?:it|test)\(/gm) || []).length;
    const expectCount = (testContent.match(/expect\(/g) || []).length;
    if (testCount > 0 && expectCount <= testCount) {
        return `${path.relative(ROOT, unitTestFile)} — mocks I/O, only ${expectCount} expect(s) for ${testCount} test(s), no integration test`;
    }
    return null;
}

function checkExportsForSource(src: string, testFiles: Set<string>, untested: string[]): void {
    const content = fs.readFileSync(src, 'utf8');
    const exportMatches = content.match(/^export (?:function|const|class) (\w+)/gm);
    if (!exportMatches) return;

    const exports = exportMatches.map((l) => l.replace(/^export (?:function|const|class) /, ''));
    const dir = path.dirname(src);
    const base = path.basename(src, '.ts');

    const expectedUnitTests = [path.join(dir, `${base}.test.ts`), path.join(dir, '__tests__', `${base}.test.ts`)];
    const expectedIntegrationTest = path.join(dir, '__tests__', 'integration', `${base}.integration.test.ts`);
    const expectedE2eFiles = getMatchingE2eFiles(base);

    const hasUnitTest = expectedUnitTests.some((f) => testFiles.has(f));
    const hasIntegrationTest = testFiles.has(expectedIntegrationTest);
    const hasE2eTest = expectedE2eFiles.some((f) => testFiles.has(f));

    if (!hasUnitTest && !hasIntegrationTest && !hasE2eTest) {
        untested.push(`${path.relative(ROOT, src)} — exports [${exports.join(', ')}] — no test file found`);
        return;
    }

    if (hasUnitTest && !hasIntegrationTest) {
        for (const uf of expectedUnitTests) {
            const msg = checkMockOnlyUnitTest(uf, testFiles);
            if (msg) {
                untested.push(msg);
                break;
            }
        }
    }
}

function detectUntestedExports(): Finding {
    const srcFiles = listSourceFiles();
    const testFiles = new Set(listTestFiles());
    const untested: string[] = [];

    for (const src of srcFiles) {
        checkExportsForSource(src, testFiles, untested);
    }

    return {
        category: 'untested_exports',
        severity: untested.length > 0 ? 'medium' : 'low',
        count: untested.length,
        fileCount: untested.length,
        description: `${untested.length} production files lack real test coverage (only mocked unit tests or no tests at all).`,
        files: untested,
        recommendation:
            untested.length > 0
                ? `Add real integration tests. See: ${untested
                      .slice(0, 3)
                      .map((f) => f.split(' — ')[0])
                      .join(', ')}`
                : 'No issues found.',
    };
}

function detectMockReturnMismatch(): Finding {
    const testFiles = listTestFiles();
    const suspicious: string[] = [];

    for (const f of testFiles) {
        const content = fs.readFileSync(f, 'utf8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i] ?? '';
            if (!line.includes('mockImplementation') && !line.includes('mockReturnValue')) continue;

            // Check up to 10 surrounding lines for the mock body
            const block = lines.slice(i, Math.min(i + 10, lines.length)).join('\n');

            // Pattern: mock checks args for vitest subcommand (related/list) AND returns test file paths
            const checksVitestArg =
                block.includes("args?.includes('related'") ||
                block.includes('args?.includes("related"') ||
                block.includes("args?.includes('list'") ||
                block.includes('args?.includes("list"');

            const hasReturnWithTestPath = /return\s+['"`][^'"`]*\.test\.\w+['"`]/.test(block);

            if (checksVitestArg && hasReturnWithTestPath) {
                suspicious.push(`${path.relative(ROOT, f)}:${i + 1}`);
                break;
            }
        }
    }

    return {
        category: 'mock_return_mismatch',
        severity: suspicious.length > 0 ? 'high' : 'low',
        count: suspicious.length,
        fileCount: suspicious.length,
        description: `${suspicious.length} test files mock execFileSync with simple paths instead of realistic command output — masks real format mismatches.`,
        files: suspicious,
        recommendation:
            suspicious.length > 0
                ? 'Mock return values must match real command output format. Use JSON for structured commands, or fixture files.'
                : 'No issues found.',
    };
}

/* ── Runner ─────────────────────────────────────────────────────── */

const detectors: (() => Finding)[] = [
    detectChildProcessMocks,
    detectFsMocks,
    detectLoggerMocks,
    detectIntegrationMocks,
    detectUntestedExports,
    detectMockReturnMismatch,
];

interface Report {
    generatedAt: string;
    summary: { total: number; high: number; medium: number; low: number };
    findings: Finding[];
}

function run(): Report {
    const findings: Finding[] = detectors.map((fn) => {
        try {
            return fn();
        } catch (err) {
            return {
                category: 'error',
                severity: 'low',
                count: 1,
                fileCount: 1,
                description: `Error: ${String(err)}`,
                files: [],
                recommendation: 'Run manually to investigate',
            };
        }
    });

    return {
        generatedAt: new Date().toISOString(),
        summary: {
            total: findings.length,
            high: findings.filter((f) => f.severity === 'high').length,
            medium: findings.filter((f) => f.severity === 'medium').length,
            low: findings.filter((f) => f.severity === 'low').length,
        },
        findings,
    };
}

function printSeverityGroup(findings: Finding[], label: string, icon: string, maxFiles: number): void {
    if (findings.length === 0) return;
    process.stdout.write(`${icon}  ${findings.length} ${label} severity finding(s):\n`);
    for (const f of findings) {
        process.stdout.write(`  ${icon} ${f.category}: ${f.description}\n`);
        for (const file of f.files.slice(0, maxFiles)) {
            process.stdout.write(`    - ${file}\n`);
        }
        if (f.files.length > maxFiles) process.stdout.write(`    ... and ${f.files.length - maxFiles} more\n`);
        process.stdout.write(`  \u2192 ${f.recommendation}\n\n`);
    }
}

function printReport(report: Report): void {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n\n');

    const high = report.findings.filter((f) => f.severity === 'high');
    const medium = report.findings.filter((f) => f.severity === 'medium');

    printSeverityGroup(high, 'HIGH', '\u26a0\ufe0f', 15);
    printSeverityGroup(medium, 'MEDIUM', '\u2139\ufe0f', 10);

    process.stdout.write(
        `\nSummary: ${report.summary.high} high, ${report.summary.medium} medium, ${report.summary.low} low\n`,
    );
}

const args = process.argv.slice(2);
const report = run();

if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
    printReport(report);
}

if (report.summary.high > 0 && args.includes('--fail')) {
    process.exit(1);
}
