#!/usr/bin/env node
/**
 * generate-env-example.ts — Regenerates .env.example from shared/config-schema.ts
 *
 * Usage:
 *   npx tsx scripts/generate-env-example.ts
 *
 * This script reads CONFIG_SCHEMA and writes .env.example with all env vars
 * organized by category. Run whenever CONFIG_SCHEMA changes to keep
 * .env.example in sync.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONFIG_SCHEMA } from '../shared/config-schema.js';

const HEADER = `# ═══════════════════════════════════════════════════════════════
# QA Tools — Environment Configuration
# Copy to .env and fill in your values
# ═══════════════════════════════════════════════════════════════
#
# AUTO-GENERATED from shared/config-schema.ts. Do not edit manually.
# Run: npx tsx scripts/generate-env-example.ts

`;

type CategoryGroup = {
    label: string;
    lines: string[];
};

const CATEGORY_LABELS: Record<string, string> = {
    jira: 'Jira / Xray',
    git: 'Git (GitLab)',
    github: 'Git (GitHub)',
    cypress: 'Cypress',
    import: 'CSV / JSON Import',
    behavior: 'Behavior',
    logging: 'Logging',
    state: 'State',
    llm: 'LLM Providers',
    'qa-tools': 'QA Tools',
    ci: 'CI/CD',
    opencode: 'Opencode',
};

const groups = new Map<string, CategoryGroup>();

for (const f of CONFIG_SCHEMA) {
    const cat = f.category || 'other';
    if (!groups.has(cat)) {
        const labelEntries = Object.entries(CATEGORY_LABELS);
        const labelEntry = labelEntries.find(([k]) => k === cat);
        groups.set(cat, { label: labelEntry?.[1] ?? cat, lines: [] });
    }
    let line = f.envVar + '=';
    if (f.defaultVal !== undefined) {
        line += String(f.defaultVal);
    }
    if (f.description) {
        line += '  # ' + f.description;
    }
    groups.get(cat)?.lines.push(line);
}

const categoryOrder = [
    'jira',
    'git',
    'github',
    'cypress',
    'import',
    'behavior',
    'qa-tools',
    'logging',
    'state',
    'llm',
    'ci',
    'opencode',
];

let output = HEADER;

for (const cat of categoryOrder) {
    const g = groups.get(cat);
    if (!g || g.lines.length === 0) continue;
    output += `# ── ${g.label} ──────────────────────────────────────────────\n`;
    output += g.lines.join('\n') + '\n\n';
}

const target = resolve(import.meta.dirname, '..', '.env.example');
writeFileSync(target, output, 'utf8');
