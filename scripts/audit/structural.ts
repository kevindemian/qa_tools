/** Structural duplication auditor — detects repeated patterns, not literal text.
 *  Run via: npx ts-node scripts/audit/structural.ts
 *  Each pattern is a class that implements `Pattern`.
 *  Output: JSON array of findings. */

import { execFileSync } from 'child_process';

interface Finding {
    pattern: string;
    severity: 'high' | 'medium' | 'low';
    count: number;
    description: string;
    recommendation: string;
    locations?: string[];
}

interface Pattern {
    name: string;
    severity: 'high' | 'medium' | 'low';
    detect(): Finding;
}

// ── Helpers ──────────────────────────────────────────────────────────

function grep(pattern: string, path: string): string {
    try {
        return execFileSync('rg', ['-n', pattern, '--include', '*.ts', path], {
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch {
        return '';
    }
}

function grepFiles(pattern: string, path: string): string[] {
    const out = grep(pattern, path);
    return out ? [...new Set(out.split('\n').map((l) => l.split(':')[0] ?? l))] : [];
}

function count(pattern: string, path: string): number {
    const out = grep(pattern, path);
    return out ? out.split('\n').length : 0;
}

// ── Patterns ─────────────────────────────────────────────────────────

class ConfigGetterPattern implements Pattern {
    name = 'Config getter pattern';
    severity = 'medium' as const;
    detect(): Finding {
        const instanceCount = count('^\\s+get \\w+\\(\\)', 'shared/config.ts');
        const staticCount = count('^\\s+static get \\w+\\(\\)', 'shared/config.ts');
        const total = instanceCount + staticCount;
        return {
            pattern: this.name,
            severity: total > 50 ? 'high' : 'medium',
            count: total,
            description: `Config class has ${instanceCount} instance getters + ${staticCount} static delegators = ${total} total getters, each with identical pattern`,
            recommendation:
                total > 50
                    ? 'Replace with map-based proxy: define config keys in a typed Map and generate getters via Object.defineProperty'
                    : 'Monitor: current count is manageable',
        };
    }
}

class JestMockBoilerplate implements Pattern {
    name = 'jest.mock boilerplate';
    severity = 'high' as const;
    detect(): Finding {
        const promptFiles = grepFiles('jest\\.mock.*prompt', "-g '*.test.ts'");
        const loggerFiles = grepFiles('jest\\.mock.*logger', "-g '*.test.ts'");
        return {
            pattern: this.name,
            severity: promptFiles.length > 5 || loggerFiles.length > 5 ? 'high' : 'medium',
            count: promptFiles.length + loggerFiles.length,
            description: `${promptFiles.length} test files mock prompt, ${loggerFiles.length} mock logger`,
            recommendation: 'Create __mocks__/prompt.ts and __mocks__/logger.ts so vi.mock() auto-resolves',
        };
    }
}

class TryCatchPushHistory implements Pattern {
    name = 'try/catch + pushHistory pattern';
    severity = 'medium' as const;
    detect(): Finding {
        const matches = grep('catch.*err.*printError', 'jira_management/commands/ -g "!*.test.ts"');
        const locations = matches ? matches.split('\n').map((l) => l.split(':').slice(0, 2).join(':')) : [];
        return {
            pattern: this.name,
            severity: locations.length > 5 ? 'medium' : 'low',
            count: locations.length,
            description: `${locations.length} handlers implement try/catch + printError manually`,
            recommendation: 'Evaluate if safeJiraCall from shared/jira-helper.ts can replace each instance',
            locations: locations.slice(0, 20),
        };
    }
}

class HtmlWrapperBoilerplate implements Pattern {
    name = 'HTML wrapper boilerplate';
    severity = 'medium' as const;
    detect(): Finding {
        const generators = grepFiles('<!DOCTYPE html>', '-g "*.ts" -g "!*.test.ts"');
        count('qa-theme', '-g "*.ts" -g "!*.test.ts"');
        const withReportTheme = count('qa-report-theme', '-g "*.ts" -g "!*.test.ts"');
        const issues: string[] = [];
        if (withReportTheme > 0)
            issues.push(`${withReportTheme} file(s) still use 'qa-report-theme' instead of 'qa-theme'`);
        return {
            pattern: this.name,
            severity: generators.length > 3 ? 'high' : 'medium',
            count: generators.length,
            description: `${generators.length} files generate full HTML pages.${issues.length ? ' Issues: ' + issues.join('; ') : ''}`,
            recommendation:
                'Use shared/html-factory.ts buildHtmlPage() for all new HTML generators; migrate existing ones incrementally',
        };
    }
}

class DarkModeInconsistency implements Pattern {
    name = 'Dark mode localStorage key inconsistency';
    severity = 'high' as const;
    detect(): Finding {
        const keys = grep('localStorage\\.(getItem|setItem)\\(.*theme', '-g "*.ts"');
        const uniqueKeys = keys
            ? [
                  ...new Set(
                      keys.split('\n').map((l) => {
                          const m = l.match(/['"]([^'"]+theme[^'"]*)['"]/);
                          return m ? m[1]! : 'unknown';
                      }),
                  ),
              ]
            : [];
        return {
            pattern: this.name,
            severity: uniqueKeys.length > 1 ? 'high' : 'low',
            count: uniqueKeys.length,
            description: `Found ${uniqueKeys.length} unique theme localStorage keys: ${uniqueKeys.join(', ')}`,
            recommendation:
                uniqueKeys.length > 1
                    ? 'Consolidate to a single key (qa-theme) across all generators'
                    : 'All generators use the same key — OK',
        };
    }
}

class GitProviderTwins implements Pattern {
    name = 'Git provider method post-processing';
    severity = 'medium' as const;
    detect(): Finding {
        const ghDiffLoops = count('for.*of.*data', 'git_triggers/github_manager.ts');
        const glDiffLoops = count('for.*of.*data', 'git_triggers/gitlab_manager.ts');
        return {
            pattern: this.name,
            severity: ghDiffLoops > 0 && glDiffLoops > 0 ? 'medium' : 'low',
            count: ghDiffLoops + glDiffLoops,
            description: `GitHub has ${ghDiffLoops} data-iteration loops, GitLab has ${glDiffLoops}`,
            recommendation: 'Extract shared post-processing to GitProviderBase (e.g., _formatDiffResponse)',
        };
    }
}

// ── Runner ───────────────────────────────────────────────────────────

const patterns: Pattern[] = [
    new ConfigGetterPattern(),
    new JestMockBoilerplate(),
    new TryCatchPushHistory(),
    new HtmlWrapperBoilerplate(),
    new DarkModeInconsistency(),
    new GitProviderTwins(),
];

function run(): void {
    const findings: Finding[] = patterns.map((p) => {
        try {
            return p.detect();
        } catch (err) {
            return {
                pattern: p.name,
                severity: 'low',
                count: -1,
                description: `Error: ${(err as Error).message}`,
                recommendation: 'Run manually',
            };
        }
    });
    // eslint-disable-next-line no-console -- CLI audit script output
    console.log(JSON.stringify(findings, null, 2));

    const high = findings.filter((f) => f.severity === 'high');
    if (high.length > 0) {
        // eslint-disable-next-line no-console -- CLI audit script output
        console.log(`\n\u26a0\ufe0f  ${high.length} HIGH severity finding(s) require attention:`);
        for (const f of high) {
            // eslint-disable-next-line no-console -- CLI audit script output
            console.log(`  - ${f.pattern}: ${f.description}`);
            // eslint-disable-next-line no-console -- CLI audit script output
            console.log(`    \u2192 ${f.recommendation}`);
        }
    }
}

run();
