#!/usr/bin/env tsx
/**
 * fix-async-test-functions.ts — Makes test functions async when they contain await
 */
import { readFileSync, writeFileSync } from 'fs';

const FILES = [
    'jira_management/xray-history.test.ts',
    'shared/__tests__/integration/quarantine.integration.test.ts',
    'shared/cli_base.test.ts',
    'shared/host-semaphore.test.ts',
    'shared/llm-cache.test.ts',
    'shared/llm-client.test.ts',
    'shared/llm-rate-limiter.test.ts',
    'shared/quarantine.test.ts',
];

let totalFixed = 0;

for (const filePath of FILES) {
    let content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    let changed = false;

    for (let i = 0; i < lines.length; i++) {
        if (!lines[i].includes('await vi.advanceTimersByTimeAsync')) continue;

        // Walk backwards to find the enclosing it/test function
        for (let j = i - 1; j >= 0; j--) {
            const line = lines[j];
            // Match it('...', () => { or test('...', () => {
            const match = line.match(/^(\s*)(it|test)\s*\(\s*['"`].*['"`]\s*,\s*\(\)\s*=>\s*\{/);
            if (match) {
                // Check if already async
                if (!line.includes('async')) {
                    lines[j] = line.replace('() =>', 'async () =>');
                    changed = true;
                    totalFixed++;
                }
                break;
            }
            // Also check it('...', async () => {
            const matchAsync = line.match(/^(\s*)(it|test)\s*\(\s*['"`].*['"`]\s*,\s*async\s*\(\)\s*=>\s*\{/);
            if (matchAsync) {
                // Already async
                break;
            }
        }
    }

    if (changed) {
        writeFileSync(filePath, lines.join('\n'));
        console.log(`Fixed: ${filePath}`);
    }
}

console.log(`\nTotal: ${totalFixed} functions made async`);
