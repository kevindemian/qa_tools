import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { rootLogger } from '../shared/logger.js';

interface LintMessage {
    line: number;
    severity: number;
    message: string;
    ruleId: string | null;
}

interface LintResult {
    filePath: string;
    messages: LintMessage[];
}

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ESLINT_BIN = path.resolve(path.join(ROOT, 'node_modules/eslint/bin/eslint.js'));

const GIT_BIN = process.env['GIT_BIN'] || '/usr/bin/git';

function hasStdout(err: unknown): err is { stdout: string; stderr?: string; status?: number } {
    return typeof err === 'object' && err !== null && 'stdout' in err;
}

function parseLintMessage(raw: unknown): LintMessage | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const m = raw as Record<string, unknown>;
    const line = m['line'];
    const severity = m['severity'];
    const message = m['message'];
    if (typeof line !== 'number' || typeof severity !== 'number' || typeof message !== 'string') return null;
    const ruleId = m['ruleId'];
    return {
        line,
        severity,
        message,
        ruleId: typeof ruleId === 'string' ? ruleId : null,
    };
}

function parseLintResult(raw: unknown): LintResult | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const filePath = r['filePath'];
    const messagesRaw = r['messages'];
    if (typeof filePath !== 'string' || !Array.isArray(messagesRaw)) return null;
    const messages: LintMessage[] = [];
    for (const msg of messagesRaw) {
        const parsed = parseLintMessage(msg);
        if (parsed) messages.push(parsed);
    }
    return { filePath, messages };
}

function parseLintResults(out: string): LintResult[] {
    const parsed: unknown = JSON.parse(out);
    if (!Array.isArray(parsed)) throw new Error('expected array');
    const results: LintResult[] = [];
    for (const item of parsed) {
        const result = parseLintResult(item);
        if (result) results.push(result);
    }
    return results;
}

function diffFiles(): string[] {
    const collected = new Set<string>();
    const tryDiff = (args: string[]): void => {
        try {
            const out = execFileSync(GIT_BIN, args, { cwd: ROOT, encoding: 'utf8' });
            for (const s of out.split('\n')) {
                const t = s.trim();
                if (t) collected.add(t);
            }
        } catch (err) {
            rootLogger.warn(`run-noswallow: falha ao obter diff [${args.join(' ')}]: ${String(err)}`);
        }
    };
    const baseRef = process.env['GITHUB_BASE_REF'];
    if (baseRef) {
        tryDiff(['diff', '--name-only', `origin/${baseRef}...HEAD`]);
    } else {
        tryDiff(['diff', '--name-only', 'HEAD~1', 'HEAD']);
    }
    tryDiff(['diff', '--name-only', 'HEAD']);
    tryDiff(['diff', '--cached', '--name-only']);
    return [...collected]
        .filter((s) => s.endsWith('.ts') && !s.endsWith('.test.ts') && fs.existsSync(path.join(ROOT, s)))
        .map((s) => path.join(ROOT, s));
}

function generateTempConfig(tmpDir: string): string {
    const pluginPath = path.join(ROOT, 'scripts/eslint-plugins/no-swallow.cjs');
    const configPath = path.join(tmpDir, 'eslint.config.mjs');
    const content = [
        `import localNoSwallow from ${JSON.stringify(pluginPath)};`,
        `export default [{`,
        `    plugins: { 'local-no-swallow': localNoSwallow },`,
        `    rules: { 'local-no-swallow/no-swallow': 'error' },`,
        `}];`,
        '',
    ].join('\n');
    fs.writeFileSync(configPath, content, 'utf-8');
    return configPath;
}

function runEslintOnFiles(files: string[], tmpConfig: string, tmpDir: string): LintResult[] {
    let out: string;
    try {
        out = execFileSync(
            process.execPath,
            [ESLINT_BIN, '--no-cache', '--no-config-lookup', '--config', tmpConfig, '--format', 'json', ...files],
            {
                encoding: 'utf-8',
                maxBuffer: 10 * 1024 * 1024,
                timeout: 60_000,
                stdio: ['pipe', 'pipe', 'pipe'],
            },
        );
    } catch (err: unknown) {
        if (hasStdout(err) && err.stdout) {
            out = err.stdout;
        } else {
            rootLogger.error(
                `[no-swallow] erro executando ESLint nos arquivos do diff: ${err instanceof Error ? err.message : String(err)}`,
            );
            process.exit(1);
        }
    } finally {
        try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        } catch (cleanupErr) {
            rootLogger.warn(`[no-swallow] cleanup failed: ${String(cleanupErr)}`);
        }
    }
    try {
        return parseLintResults(out);
    } catch (parseErr) {
        rootLogger.error(`[no-swallow] erro ao interpretar resultado do ESLint: ${String(parseErr)}`);
        process.exit(1);
    }
}

function main(): void {
    const files = diffFiles();
    if (files.length === 0) {
        rootLogger.info('[no-swallow] nenhum arquivo .ts de producao no diff; pulando.');
        return;
    }

    if (!fs.existsSync(ESLINT_BIN)) {
        rootLogger.error(`[no-swallow] ESLint binary not found at ${ESLINT_BIN}`);
        process.exit(1);
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'noswallow-'));
    const tmpConfig = generateTempConfig(tmpDir);
    const results = runEslintOnFiles(files, tmpConfig, tmpDir);

    const violations: string[] = [];
    for (const result of results) {
        for (const msg of result.messages) {
            if (msg.ruleId === 'local-no-swallow/no-swallow') {
                violations.push(`  ${path.relative(ROOT, result.filePath)}:${msg.line} ${msg.message}`);
            }
        }
    }
    if (violations.length > 0) {
        rootLogger.error(
            `[no-swallow] ${violations.length} supressao(oes) de erro detectada(s) em arquivos do diff:\n${violations.join('\n')}`,
        );
        process.exit(1);
    }
    rootLogger.info('[no-swallow] OK — nenhuma supressao de erro em arquivos do diff.');
}

try {
    main();
} catch (err) {
    rootLogger.error(`[no-swallow] erro interno: ${String(err)}`);
    process.exit(1);
}
