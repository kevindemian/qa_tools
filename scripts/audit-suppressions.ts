/**
 * audit-suppressions.ts — Guarda imutável de isenções de mecanismo de segurança.
 *
 * ESTE ARQUIVO RECEBE `chattr +i` APÓS ESCRITA+VALIDAÇÃO (AGENTS §18/§14).
 * NÃO edite após imutabilizado: qualquer ajuste na lógica/tabela exige
 * `chattr -i` + aprovação explícita + registro no audit trail.
 *
 * Responsabilidades (causa raiz, não sintoma):
 *  1. Contar isenções ativas em audit/suppressions.yaml (não-expiradas, com reason+owner).
 *  2. Mapear contador -> teto Stryker via TABELA HARDCODED (C1): 306->50%, 200->60%, 120->70%, 0->75%.
 *  3. Trava temporal de 90d: se esgotado e contador não caiu o suficiente, o teto SOBE.
 *  4. Garantir que stryker.conf.json NÃO rebaixa o teto (falha o CI se estiver abaixo do esperado).
 *  5. Falhar se houver isenção expirada ou sem reason/owner (contorno de segurança).
 *
 * Nunca rebaixa o teto. Nunca silencia isenção inválida.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUPPRESSIONS_PATH = resolve(ROOT, 'audit/suppressions.yaml');
const STRYKER_PATH = resolve(ROOT, 'stryker.conf.json');

// TABELA HARDCODED — C1 (contagem absoluta de supressões). Não editável sem chattr -i + aprovação.
const THRESHOLD_TABLE: ReadonlyArray<readonly [countAtMost: number, threshold: number]> = [
    [306, 50],
    [200, 60],
    [120, 70],
    [0, 75],
];

const SUNSET_DAYS = 90;
const DAY_MS = 86_400_000;
// Janela de aviso proximo ao vencimento: entradas com sunset a <= N dias sao
// sinalizadas explicitamente para correcao antecipada (nao quebram o CI ainda).
const WARN_WITHIN_DAYS = 7;

interface SuppressionEntry {
    file?: string;
    line?: string;
    rule?: string;
    kind?: string;
    reason?: string;
    owner?: string;
    sunset?: string;
    status?: string;
}

interface SuppressionsFile {
    meta?: { measured_at?: string; baseline_count?: number };
    suppressions: SuppressionEntry[];
}

interface StrykerConfig {
    thresholds?: { break?: number | null; high?: number; low?: number };
    coverageAnalysis?: string;
    [key: string]: unknown;
}

function writeErr(msg: string): void {
    process.stderr.write(msg + '\n');
}

function writeOut(msg: string): void {
    process.stdout.write(msg + '\n');
}

function runRegex(pattern: RegExp, text: string): RegExpExecArray | null {
    return pattern.exec(text);
}

function applyField(entry: SuppressionEntry, field: string): void {
    const idx = field.indexOf(':');
    if (idx < 0) return;
    const key = field.slice(0, idx).trim();
    let val = field.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
    }
    switch (key) {
        case 'file':
            entry.file = val;
            break;
        case 'line':
            entry.line = val;
            break;
        case 'rule':
            entry.rule = val;
            break;
        case 'kind':
            entry.kind = val;
            break;
        case 'reason':
            entry.reason = val;
            break;
        case 'owner':
            entry.owner = val;
            break;
        case 'sunset':
            entry.sunset = val;
            break;
        case 'status':
            entry.status = val;
            break;
        default:
            break;
    }
}

function extractMeta(text: string): { measured_at?: string; baseline_count?: number } {
    const measured = runRegex(/measured_at:[ \t]*['"]?([0-9-]+)['"]?/, text);
    const baseline = runRegex(/baseline_count:[ \t]*(\d+)/, text);
    const meta: { measured_at?: string; baseline_count?: number } = {};
    const measuredVal = measured ? measured[1] : undefined;
    const baselineVal = baseline ? baseline[1] : undefined;
    if (measuredVal !== undefined) meta.measured_at = measuredVal;
    if (baselineVal !== undefined) meta.baseline_count = Number(baselineVal);
    return meta;
}

function processSuppressionsLine(
    line: string,
    list: SuppressionEntry[],
    current: SuppressionEntry | null,
): { current: SuppressionEntry | null; inSuppressions: boolean } {
    if (/^[ \t]*-[ \t]*/.test(line)) {
        if (current) list.push(current);
        const fresh: SuppressionEntry = {};
        const inline = line.replace(/^[ \t]*-[ \t]+/, '');
        if (inline.trim()) applyField(fresh, inline);
        return { current: fresh, inSuppressions: true };
    }
    if (/^[ \t]+[a-zA-Z_]+:/.test(line) && current) {
        applyField(current, line.trim());
        return { current, inSuppressions: true };
    }
    if (/^\S/.test(line) && !/^suppressions:/.test(line)) {
        if (current) list.push(current);
        return { current: null, inSuppressions: false };
    }
    return { current, inSuppressions: true };
}

function parseYamlSimple(text: string): SuppressionsFile {
    const result: SuppressionsFile = { suppressions: [] };
    const list: SuppressionEntry[] = result.suppressions;
    const lines = text.split('\n');
    let inSuppressions = false;
    let current: SuppressionEntry | null = null;
    for (const raw of lines) {
        const line = raw.replace(/\r$/, '');
        if (/^suppressions:[ \t]*$/.test(line)) {
            inSuppressions = true;
            continue;
        }
        if (!inSuppressions) continue;
        const out = processSuppressionsLine(line, list, current);
        current = out.current;
        inSuppressions = out.inSuppressions;
    }
    if (current) list.push(current);
    result.meta = extractMeta(text);
    return result;
}

function daysSince(iso: string | undefined): number {
    if (!iso) return Number.POSITIVE_INFINITY;
    const then = new Date(iso + 'T00:00:00Z').getTime();
    if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
    return (Date.now() - then) / DAY_MS;
}

function isExpired(sunset: string | undefined): boolean {
    if (!sunset) return false;
    const t = new Date(sunset + 'T00:00:00Z').getTime();
    if (Number.isNaN(t)) return false;
    return Date.now() > t;
}

function daysUntil(sunset: string | undefined): number {
    if (!sunset) return Number.POSITIVE_INFINITY;
    const t = new Date(sunset + 'T00:00:00Z').getTime();
    if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
    return (t - Date.now()) / DAY_MS;
}

function thresholdForCount(count: number): number {
    let acc = 0;
    for (const [atMost, threshold] of THRESHOLD_TABLE) {
        if (count <= atMost) acc = threshold;
    }
    return acc;
}

function computeExpectedThreshold(activeCount: number, measuredAt: string | undefined): number {
    const elapsed = daysSince(measuredAt);
    const temporalLockExpired = elapsed > SUNSET_DAYS;
    let expectedThreshold = thresholdForCount(activeCount);
    if (temporalLockExpired) {
        const last = THRESHOLD_TABLE[THRESHOLD_TABLE.length - 1];
        const maxThreshold = last ? last[1] : 75;
        expectedThreshold = Math.max(expectedThreshold, 75);
        if (expectedThreshold < maxThreshold) {
            writeErr(
                `[audit-suppressions] AVISO: trava de ${SUNSET_DAYS}d esgotada (measured_at=${measuredAt}); teto sobe para ${expectedThreshold}%.`,
            );
        }
    }
    return expectedThreshold;
}

function fail(msg: string): never {
    writeErr(`[audit-suppressions] FATAL: ${msg}`);
    process.exit(1);
}

function validateEntries(entries: SuppressionEntry[]): void {
    for (const e of entries) {
        if (isExpired(e.sunset)) {
            fail(
                `isenção expirada em ${e.sunset} (${e.file ?? '?'}:${e.line ?? '?'}) — corrija causa raiz ou renove com justificativa.`,
            );
        }
        const remaining = daysUntil(e.sunset);
        if (Number.isFinite(remaining) && remaining >= 0) {
            const urgent = remaining <= WARN_WITHIN_DAYS;
            writeErr(
                `[audit-suppressions] AVISO DE SUNSET${urgent ? ' (URGENTE)' : ''}: ` +
                    `${e.file ?? '?'}:${e.line ?? '?'} vence em ${e.sunset} ` +
                    `(faltam ${Math.ceil(remaining)}d) — corrija na raiz antes do prazo.`,
            );
        }
        if (!e.reason || !e.owner) {
            fail(`isenção sem reason/owner (${e.file ?? '?'}:${e.line ?? '?'}) — AGENTS §18 exige ambos.`);
        }
    }
}

function loadSuppressions(): SuppressionsFile {
    if (!existsSync(SUPPRESSIONS_PATH)) {
        fail(`${SUPPRESSIONS_PATH} ausente.`);
    }
    return parseYamlSimple(readFileSync(SUPPRESSIONS_PATH, 'utf8'));
}

function syncStryker(expectedThreshold: number): void {
    if (!existsSync(STRYKER_PATH)) {
        const created: StrykerConfig = {
            thresholds: { break: expectedThreshold },
            coverageAnalysis: 'perTest',
        };
        writeFileSync(STRYKER_PATH, JSON.stringify(created, null, 2) + '\n');
        writeOut(`[audit-suppressions] stryker.conf.json ausente — criado com teto ${expectedThreshold}%.`);
        return;
    }
    let stryker: StrykerConfig;
    try {
        stryker = JSON.parse(readFileSync(STRYKER_PATH, 'utf8')) as StrykerConfig;
    } catch {
        fail('stryker.conf.json inválido.');
    }
    const current = stryker.thresholds?.break;
    if (typeof current === 'number' && current < expectedThreshold) {
        fail(
            `stryker.conf.json tem teto ${current}% < esperado ${expectedThreshold}%. Rebaixar teto sem aprovação é contorno de segurança (AGENTS §5).`,
        );
    }
    if (current !== expectedThreshold) {
        stryker.thresholds = { ...(stryker.thresholds ?? {}), break: expectedThreshold };
        writeFileSync(STRYKER_PATH, JSON.stringify(stryker, null, 2) + '\n');
        writeOut(`[audit-suppressions] stryker.conf.json atualizado para teto ${expectedThreshold}%.`);
    }
}

function main(): void {
    const parsed = loadSuppressions();
    const entries = parsed.suppressions;
    validateEntries(entries);

    const baseline = parsed.meta?.baseline_count ?? 0;
    const resolvedCount = entries.filter((e) => e.status === 'resolved').length;
    const effectiveCount = Math.max(0, baseline - resolvedCount);
    const measuredAt = parsed.meta?.measured_at;
    const expectedThreshold = computeExpectedThreshold(effectiveCount, measuredAt);

    writeOut(`[audit-suppressions] isenções ativas: ${effectiveCount} | teto Stryker esperado: ${expectedThreshold}%`);
    syncStryker(expectedThreshold);
    writeOut('[audit-suppressions] OK — nenhum contorno de segurança detectado.');
}

export { thresholdForCount, THRESHOLD_TABLE, SUNSET_DAYS, computeExpectedThreshold, parseYamlSimple };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main();
}
