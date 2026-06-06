#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

const FILES = [
    'git_triggers/case00-handler.test.ts',
    'git_triggers/github-api.test.ts',
    'git_triggers/github-branch.test.ts',
    'git_triggers/github-issues.test.ts',
    'git_triggers/github-pr.test.ts',
    'git_triggers/github-workflow.test.ts',
    'git_triggers/gitlab-api.test.ts',
    'git_triggers/nivelar.test.ts',
    'jira_management/commands/case17-test-utils.test.ts',
    'jira_management/commands/case17.test.ts',
    'jira_management/commands/case18.test.ts',
    'jira_management/commands/handlers.test.ts',
    'jira_management/create_tests.test.ts',
    'jira_management/import-loop.test.ts',
    'jira_management/import-prep.test.ts',
    'jira_management/issue-linker.test.ts',
    'jira_management/jira_link_manager.test.ts',
    'jira_management/jira_resource.test.ts',
    'jira_management/link-operations.test.ts',
    'jira_management/link-types.test.ts',
    'jira_management/main.test.ts',
    'jira_management/precondition-handler.test.ts',
    'jira_management/precondition-importer.test.ts',
    'jira_management/result_reporter.test.ts',
    'jira_management/test-case-factory.test.ts',
    'jira_management/test-execution-creator.test.ts',
    'scripts/transform-casts.ts',
    'scripts/transform-fase2.ts',
    'scripts/transform-jest-mock.ts',
    'setup/main.test.ts',
    'shared/bug-report.test.ts',
    'shared/cli_base.test.ts',
    'shared/developer-profile.test.ts',
    'shared/failure-analysis.test.ts',
    'shared/flaky-auto-actions.test.ts',
    'shared/llm-benchmark.test.ts',
    'shared/logger.test.ts',
    'shared/open.test.ts',
    'shared/output.test.ts',
    'shared/splash.test.ts',
    'shared/test-utils.ts',
    'shared/test-utils/factories/config-factory.ts',
    'shared/test-utils/factories/context-factory.ts',
    'shared/test-utils/factories/git-provider-factory.test.ts',
    'shared/test-utils/factories/git-provider-factory.ts',
    'shared/test-utils/factories/jira-resource-factory.ts',
    'shared/test-utils/factories/link-manager-factory.ts',
    'shared/test-utils/factories/response-factory.ts',
    'shared/test-utils/factories/test-execution-creator-factory.ts',
];

const NEEDED_TYPES = ['Mock', 'Mocked', 'MockInstance'];

for (const file of FILES) {
    const content = readFileSync(file, 'utf-8');

    const needed = NEEDED_TYPES.filter((t) => new RegExp(`\\b${t}\\b`).test(content));
    if (needed.length === 0) continue;

    // Skip if already has a type import for all needed types
    if (needed.every((t) => new RegExp(`import\\s+type[^;]*\\b${t}\\b[^;]*from\\s+['"]vitest['"]`).test(content)))
        continue;
    // Skip if already has value+type mixed import for all needed types
    if (needed.every((t) => new RegExp(`import[^;]*\\b${t}\\b[^;]*from\\s+['"]vitest['"]`).test(content))) continue;

    const stmt = `import type { ${needed.join(', ')} } from 'vitest';\n`;

    // Check if there's an existing vitest import
    const existingVitestImport = content.match(/import\s+.*?from\s+['"]vitest['"]/);
    if (existingVitestImport) {
        const insertAfter = existingVitestImport[0];
        const updated = content.replace(insertAfter, insertAfter + '\n' + stmt.trimEnd());
        writeFileSync(file, updated, 'utf-8');
        console.log(`✓ ${file} (after vitest import)`);
        continue;
    }

    // Insert after first import line
    const firstImportMatch = content.match(/^(import .+;\n)/m);
    if (firstImportMatch) {
        const updated = content.replace(firstImportMatch[1], firstImportMatch[1] + stmt);
        writeFileSync(file, updated, 'utf-8');
        console.log(`✓ ${file}`);
        continue;
    }

    const updated = stmt + content;
    writeFileSync(file, updated, 'utf-8');
    console.log(`✓ ${file} (prepend)`);
}
