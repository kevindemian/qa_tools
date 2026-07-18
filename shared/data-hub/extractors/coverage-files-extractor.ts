/**
 * Data Hub — Per-file coverage extractor.
 *
 * Pure transformation (no I/O): decodes a coverage-report artifact buffer into
 * `CoverageFile[]`. Supports the three formats CI commonly emits:
 *   - Istanbul json-summary (`coverage-final.json` / `coverage-summary.json`)
 *   - Cobertura (`cobertura-coverage.xml`)
 *   - JaCoCo (`jacoco.xml`)
 *
 * Invariants (AGENTS §24/§25):
 *   - `percentage` is computed as `covered / total * 100` and is OMITTED (absent)
 *     when it is not computable (`total <= 0` or non-finite). It is NEVER stored
 *     as NaN/Infinity and NEVER fabricated as 0.
 *   - A file with valid counts is NEVER dropped (even when `total === 0`).
 *   - Malformed entries are dropped but NEVER silently swallowed — each is
 *     returned in `errors` (caller logs/surfaces them).
 */
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import type { CoverageFile } from '../../types/data-hub.js';
import { extractErrorMessage } from '../../ui/prompt-errors.js';

/** Confidence assigned to every extracted per-file coverage entry. */
export const COVERAGE_FILES_CONFIDENCE = 0.85;

/** A single dropped entry (or whole-artifact failure). Never swallowed. */
export interface CoverageFilesParseError {
    /** Artifact (or zip entry) name the error originated from. */
    artifact: string;
    /** File/entry key when known; absent for whole-artifact failures. */
    entry?: string;
    /** Human-readable reason the entry/artifact was dropped. */
    reason: string;
}

/** Result of extracting per-file coverage from one artifact buffer. */
export interface CoverageFilesResult {
    files: CoverageFile[];
    errors: CoverageFilesParseError[];
}

type CoverageKind = 'istanbul' | 'cobertura' | 'jacoco' | 'unknown';

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: (name: string): boolean =>
        name === 'package' || name === 'class' || name === 'line' || name === 'sourcefile' || name === 'counter',
});

/** True when an artifact name looks like a coverage report (used to filter CI artifacts). */
export function isCoverageArtifact(name: string): boolean {
    const n = name.toLowerCase();
    return n.includes('coverage') || n.includes('cobertura') || n.includes('jacoco') || n.includes('clover');
}

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function isZip(name: string, buffer: Buffer): boolean {
    if (name.toLowerCase().endsWith('.zip')) return true;
    return buffer.length >= ZIP_MAGIC.length && buffer.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC);
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
}

/** Parse an integer count; rejects non-integers, negatives and non-finite. */
function toCount(value: unknown): number | undefined {
    if (typeof value === 'number') return Number.isInteger(value) && value >= 0 ? value : undefined;
    if (typeof value === 'string' && value.trim().length > 0) {
        const n = Number(value);
        return Number.isInteger(n) && n >= 0 ? n : undefined;
    }
    return undefined;
}

/** Compute line percentage; returns undefined when not computable (never NaN/Infinity/fabricated). */
function computePercentage(covered: number, total: number): number | undefined {
    if (!Number.isFinite(total) || !Number.isFinite(covered) || total <= 0) return undefined;
    const pct = (covered / total) * 100;
    return Number.isFinite(pct) ? pct : undefined;
}

function buildLines(total: number, covered: number): CoverageFile['lines'] {
    const percentage = computePercentage(covered, total);
    return percentage === undefined ? { total, covered } : { total, covered, percentage };
}

/**
 * Build an optional branches/functions sub-metric. These sub-types REQUIRE a
 * `percentage`, so the whole object is omitted when percentage is not computable
 * (e.g. total === 0) — omission, never NaN.
 */
function buildSub(total: number, covered: number): { total: number; covered: number; percentage: number } | undefined {
    const percentage = computePercentage(covered, total);
    if (percentage === undefined) return undefined;
    if (covered > total) return undefined;
    return { total, covered, percentage };
}

function detectKind(name: string, text: string): CoverageKind {
    const n = name.toLowerCase();
    if (n.includes('cobertura')) return 'cobertura';
    if (n.includes('jacoco')) return 'jacoco';
    const trimmed = text.trimStart();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'istanbul';
    if (trimmed.startsWith('<')) {
        if (/<coverage[\s>]/.test(trimmed)) return 'cobertura';
        if (/<report[\s>]/.test(trimmed)) return 'jacoco';
    }
    return 'unknown';
}

// ─── Istanbul json-summary ───────────────────────────────────────────────────

interface IstanbulSubShape {
    total?: unknown;
    covered?: unknown;
}

function coerceIstanbulEntry(file: string, raw: unknown): { file: CoverageFile } | { error: string } {
    if (raw === null || typeof raw !== 'object') return { error: 'entry is not an object' };
    const record = raw as Record<string, unknown>;
    const lines = record['lines'];
    if (lines === null || typeof lines !== 'object') return { error: 'missing lines summary' };
    const linesRecord = lines as IstanbulSubShape;
    const total = toCount(linesRecord.total);
    const covered = toCount(linesRecord.covered);
    if (total === undefined || covered === undefined) return { error: 'lines.total/covered invalid' };
    if (covered > total) return { error: 'lines.covered exceeds lines.total' };

    const cf: CoverageFile = { file, lines: buildLines(total, covered), confidence: COVERAGE_FILES_CONFIDENCE };

    const branches = coerceIstanbulSub(record['branches']);
    if (branches) cf.branches = branches;
    const functions = coerceIstanbulSub(record['functions']);
    if (functions) cf.functions = functions;

    return { file: cf };
}

function coerceIstanbulSub(raw: unknown): { total: number; covered: number; percentage: number } | undefined {
    if (raw === null || typeof raw !== 'object') return undefined;
    const sub = raw as IstanbulSubShape;
    const total = toCount(sub.total);
    const covered = toCount(sub.covered);
    if (total === undefined || covered === undefined) return undefined;
    return buildSub(total, covered);
}

function parseIstanbul(artifact: string, text: string, out: CoverageFilesResult): void {
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch (err: unknown) {
        out.errors.push({ artifact, reason: `invalid JSON: ${extractErrorMessage(err)}` });
        return;
    }
    if (json === null || typeof json !== 'object' || Array.isArray(json)) {
        out.errors.push({ artifact, reason: 'root is not an object' });
        return;
    }
    for (const [key, raw] of Object.entries(json as Record<string, unknown>)) {
        if (key === 'total') continue;
        const result = coerceIstanbulEntry(key, raw);
        if ('error' in result) {
            out.errors.push({ artifact, entry: key, reason: result.error });
            continue;
        }
        out.files.push(result.file);
    }
}

// ─── Cobertura ───────────────────────────────────────────────────────────────

function parseConditionCoverage(value: unknown): { total: number; covered: number } | undefined {
    if (typeof value !== 'string') return undefined;
    const matched = /\((\d+)\/(\d+)\)/.exec(value);
    if (!matched) return undefined;
    const covered = toCount(matched[1]);
    const total = toCount(matched[2]);
    if (covered === undefined || total === undefined) return undefined;
    return { total, covered };
}

interface FileAgg {
    lineTotal: number;
    lineCovered: number;
    branchTotal: number;
    branchCovered: number;
}

function emptyAgg(): FileAgg {
    return { lineTotal: 0, lineCovered: 0, branchTotal: 0, branchCovered: 0 };
}

function accumulateCoberturaLine(agg: FileAgg, line: Record<string, unknown>): void {
    agg.lineTotal += 1;
    const hits = toCount(line['@_hits']);
    if (hits !== undefined && hits > 0) agg.lineCovered += 1;
    const condition = parseConditionCoverage(line['@_condition-coverage']);
    if (condition) {
        agg.branchTotal += condition.total;
        agg.branchCovered += condition.covered;
    }
}

function coberturaClasses(coverage: Record<string, unknown>): Record<string, unknown>[] {
    const packagesNode = coverage['packages'];
    const packages = toArray((packagesNode as Record<string, unknown> | undefined)?.['package']);
    const classes: Record<string, unknown>[] = [];
    for (const pkg of packages) {
        const classesNode = (pkg as Record<string, unknown>)['classes'];
        for (const cls of toArray((classesNode as Record<string, unknown> | undefined)?.['class'])) {
            classes.push(cls as Record<string, unknown>);
        }
    }
    return classes;
}

function coverageFileFromAgg(file: string, agg: FileAgg): CoverageFile {
    const cf: CoverageFile = {
        file,
        lines: buildLines(agg.lineTotal, agg.lineCovered),
        confidence: COVERAGE_FILES_CONFIDENCE,
    };
    const branches = buildSub(agg.branchTotal, agg.branchCovered);
    if (branches) cf.branches = branches;
    return cf;
}

function parseCobertura(artifact: string, text: string, out: CoverageFilesResult): void {
    let doc: unknown;
    try {
        doc = xmlParser.parse(text);
    } catch (err: unknown) {
        out.errors.push({ artifact, reason: `invalid XML: ${extractErrorMessage(err)}` });
        return;
    }
    const coverage = (doc as Record<string, unknown> | undefined)?.['coverage'];
    if (coverage === null || typeof coverage !== 'object') {
        out.errors.push({ artifact, reason: 'missing <coverage> root' });
        return;
    }

    const byFile = new Map<string, FileAgg>();
    for (const cls of coberturaClasses(coverage as Record<string, unknown>)) {
        const filename = cls['@_filename'];
        if (typeof filename !== 'string' || filename.length === 0) {
            out.errors.push({ artifact, reason: 'class missing filename' });
            continue;
        }
        const agg = byFile.get(filename) ?? emptyAgg();
        const linesNode = cls['lines'];
        for (const line of toArray((linesNode as Record<string, unknown> | undefined)?.['line'])) {
            accumulateCoberturaLine(agg, line as Record<string, unknown>);
        }
        byFile.set(filename, agg);
    }

    for (const [file, agg] of byFile) {
        out.files.push(coverageFileFromAgg(file, agg));
    }
}

// ─── JaCoCo ──────────────────────────────────────────────────────────────────

function findCounter(counters: unknown[], type: string): { total: number; covered: number } | undefined {
    for (const counter of counters) {
        const record = counter as Record<string, unknown>;
        if (record['@_type'] !== type) continue;
        const missed = toCount(record['@_missed']);
        const covered = toCount(record['@_covered']);
        if (missed === undefined || covered === undefined) return undefined;
        return { total: missed + covered, covered };
    }
    return undefined;
}

function jacocoSourceFile(
    pkgName: unknown,
    sf: Record<string, unknown>,
): { file: CoverageFile } | { error: string; entry?: string } {
    const name = sf['@_name'];
    if (typeof name !== 'string' || name.length === 0) return { error: 'sourcefile missing name' };
    const file = typeof pkgName === 'string' && pkgName.length > 0 ? `${pkgName}/${name}` : name;
    const counters = toArray(sf['counter']);
    const lineCounter = findCounter(counters, 'LINE');
    if (!lineCounter) return { error: 'missing LINE counter', entry: file };

    const cf: CoverageFile = {
        file,
        lines: buildLines(lineCounter.total, lineCounter.covered),
        confidence: COVERAGE_FILES_CONFIDENCE,
    };
    const branchCounter = findCounter(counters, 'BRANCH');
    if (branchCounter) {
        const branches = buildSub(branchCounter.total, branchCounter.covered);
        if (branches) cf.branches = branches;
    }
    const methodCounter = findCounter(counters, 'METHOD');
    if (methodCounter) {
        const functions = buildSub(methodCounter.total, methodCounter.covered);
        if (functions) cf.functions = functions;
    }
    return { file: cf };
}

function parseJacoco(artifact: string, text: string, out: CoverageFilesResult): void {
    let doc: unknown;
    try {
        doc = xmlParser.parse(text);
    } catch (err: unknown) {
        out.errors.push({ artifact, reason: `invalid XML: ${extractErrorMessage(err)}` });
        return;
    }
    const report = (doc as Record<string, unknown> | undefined)?.['report'];
    if (report === null || typeof report !== 'object') {
        out.errors.push({ artifact, reason: 'missing <report> root' });
        return;
    }
    for (const pkg of toArray((report as Record<string, unknown>)['package'])) {
        const pkgRecord = pkg as Record<string, unknown>;
        const pkgName = pkgRecord['@_name'];
        for (const sf of toArray(pkgRecord['sourcefile'])) {
            const result = jacocoSourceFile(pkgName, sf as Record<string, unknown>);
            if ('error' in result) {
                out.errors.push({
                    artifact,
                    ...(result.entry != null ? { entry: result.entry } : {}),
                    reason: result.error,
                });
                continue;
            }
            out.files.push(result.file);
        }
    }
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

function parseSingle(artifact: string, text: string, out: CoverageFilesResult): void {
    switch (detectKind(artifact, text)) {
        case 'istanbul':
            parseIstanbul(artifact, text, out);
            return;
        case 'cobertura':
            parseCobertura(artifact, text, out);
            return;
        case 'jacoco':
            parseJacoco(artifact, text, out);
            return;
        default:
            out.errors.push({ artifact, reason: 'unrecognized coverage format' });
    }
}

/**
 * Extract per-file coverage from a single artifact buffer. When the buffer is a
 * zip archive, every coverage-report entry inside is parsed and merged.
 */
export function extractCoverageFiles(artifactName: string, buffer: Buffer): CoverageFilesResult {
    const out: CoverageFilesResult = { files: [], errors: [] };

    if (isZip(artifactName, buffer)) {
        let zip: AdmZip;
        try {
            zip = new AdmZip(buffer);
        } catch (err: unknown) {
            out.errors.push({ artifact: artifactName, reason: `invalid zip: ${extractErrorMessage(err)}` });
            return out;
        }
        for (const entry of zip.getEntries()) {
            if (entry.isDirectory) continue;
            const entryName = entry.entryName;
            const text = entry.getData().toString('utf-8');
            if (!isCoverageArtifact(entryName) && detectKind(entryName, text) === 'unknown') continue;
            parseSingle(entryName, text, out);
        }
        return out;
    }

    parseSingle(artifactName, buffer.toString('utf-8'), out);
    return out;
}
