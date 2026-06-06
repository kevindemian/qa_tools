#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

execSync('npx tsc -p tsconfig.build.json', { stdio: 'inherit' });

const files = ['dist/jira_management/main.js', 'dist/git_triggers/main.js'];
for (const file of files) {
    const content = readFileSync(file, 'utf8');
    writeFileSync(file, `#!/usr/bin/env node\n${content}`, 'utf8');
}
