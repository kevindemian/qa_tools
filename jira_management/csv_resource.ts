/** CSV parsing: single-step, bulk (multi-block), description/precondition/linked-issues extraction. */
import fs from 'fs';
import { csv } from '../shared/deps.js';
import { Readable } from 'stream';
import { rootLogger } from '../shared/logger.js';
import { normalizeFieldName, sanitizeCellValue } from '../shared/field-names.js';
import type { TestCase } from '../shared/types.js';
import { parseQuotedValue, extractPreconditionKey } from '../shared/quoted-string.js';
import { CsvRowSchema } from './csv-import-schema.js';
import type { CsvRow } from './csv-import-schema.js';

class CsvResource {
    /** Detect CSV separator: prefers `;` when first line has `;` and no `,`.
     * Common for Excel exports in Portuguese locale. */
    static detectSeparator(firstLine: string): string {
        return firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
    }

    readCsvFromString(csvString: string): Promise<CsvRow[]> {
        return new Promise((resolve, reject) => {
            const results: CsvRow[] = [];
            const stream = Readable.from([csvString]);
            const separator = this._detectAndWarnSeparator(csvString);
            const warnedHeaders = new Set<string>();

            stream
                .pipe(csv({ separator }))
                .on('data', (data: Record<string, string>) => {
                    const nd = this._normalizeCsvRow(data, warnedHeaders);
                    const parsed = CsvRowSchema.safeParse({
                        fields: {
                            Action: nd['Action'] || '',
                            Data: nd['Data'] || '',
                            'Expected Result': nd['Expected Result'] || '',
                        },
                    });
                    if (parsed.success) {
                        results.push(parsed.data);
                    } else {
                        rootLogger.warn('Linha CSV ignorada: ' + parsed.error.issues.map((i) => i.message).join('; '));
                    }
                })
                .on('end', () => resolve(results))
                .on('error', reject);
        });
    }

    parseDescription(lines: string[]): string {
        const line = lines.find((l) => l.startsWith('Description:'));
        return line ? line.replace('Description:', '').trim() : '';
    }

    parseGroup(lines: string[]): string | null {
        const line = lines.find((l) => l.startsWith('Group:'));
        if (!line) return null;
        const value = line.replace('Group:', '').trim();
        return value || null;
    }

    parsePrecondition(value: string | null | undefined): { type: 'reference' | 'inline'; value: string } | null {
        if (!value) return null;
        const trimmed = value.trim();
        if (!trimmed) return null;

        const key = extractPreconditionKey(trimmed);

        if (key) {
            return { type: 'reference', value: key };
        }

        return { type: 'inline', value: trimmed };
    }

    parseLinkedIssues(lines: string[]): Array<{ key: string; linkType: string }> {
        const line = lines.find((l) => l.startsWith('Linked Issues:'));
        if (!line) return [];

        const value = line.replace('Linked Issues:', '').trim();
        if (!value) return [];

        const LINKED_ISSUE_PATTERN = /(\w+-\d+)\s*\(([^)]+)\)/g;
        const results: Array<{ key: string; linkType: string }> = [];
        let match: RegExpExecArray | null;

        while ((match = LINKED_ISSUE_PATTERN.exec(value)) !== null) {
            const matchedKey = match[1] ?? '';
            const matchedType = match[2] ?? '';
            results.push({
                key: matchedKey,
                linkType: matchedType.trim(),
            });
        }

        return results;
    }

    private _parseBulkCsvDescription(
        lines: string[],
        descIndex: number,
        title: string,
    ): { description: string; descEndIndex: number } {
        const descLine = lines[descIndex] ?? '';
        const rawValue = descLine.replace(/^Description:\s*/, '');
        const parsed = parseQuotedValue(rawValue, lines, descIndex);
        let description = parsed.value;
        let descEndIndex = parsed.endIndex;

        if (parsed.endIndex >= lines.length && rawValue.startsWith('"') && !rawValue.endsWith('"')) {
            rootLogger.warn(`Description sem aspas de fechamento: "${title}"`);
        }

        if (!rawValue.startsWith('"')) {
            const stopPrefixes = ['Title:', 'Pre-condition:', 'Linked Issues:', 'Group:', 'Action,Data'];
            while (descEndIndex < lines.length) {
                const line = lines[descEndIndex] ?? '';
                if (stopPrefixes.some((p) => line.startsWith(p))) break;
                descEndIndex++;
            }
            const parts: string[] = [];
            for (let i = descIndex; i < descEndIndex; i++) {
                const line = lines[i] ?? '';
                if (i === descIndex) {
                    parts.push(line.replace(/^Description:\s*/, ''));
                } else {
                    parts.push(line);
                }
            }
            description = parts.join('\n');
        }

        return { description, descEndIndex };
    }

    private _parseBulkCsvPrecondition(
        lines: string[],
        precIndex: number,
        title: string,
    ): { precValue: string | null; precEndIndex: number } {
        const precLine = lines[precIndex] ?? '';
        const rawValue = precLine.replace(/^Pre-condition:\s*/, '');
        const parsed = parseQuotedValue(rawValue, lines, precIndex);

        if (parsed.endIndex >= lines.length && rawValue.startsWith('"') && !rawValue.endsWith('"')) {
            rootLogger.warn(`Pre-condition sem aspas de fechamento: "${title}"`);
        }

        return { precValue: parsed.value || null, precEndIndex: parsed.endIndex };
    }

    private _filterBulkCsvLines(
        lines: string[],
        descIndex: number,
        descEndIndex: number,
        precIndex: number,
        precEndIndex: number,
    ): string {
        const metadataPrefixes = ['Title:', 'Description:', 'Pre-condition:', 'Linked Issues:', 'Group:'];
        const csvLines = lines.filter((l, i) => {
            if (metadataPrefixes.some((p) => l.startsWith(p))) return false;
            if (i > descIndex && i < descEndIndex) return false;
            if (precIndex !== -1 && i >= precIndex && i < precEndIndex) return false;
            return l.length > 0 && !l.startsWith('#');
        });
        return csvLines.join('\n');
    }

    static readonly FLAT_CSV_PATTERNS = [/^Title,Action/i, /^Action,/i];

    private _detectAndWarnSeparator(csvString: string): string {
        const firstLine = csvString.split('\n')[0] ?? '';
        const separator = CsvResource.detectSeparator(firstLine);
        if (separator !== ',') {
            rootLogger.warn(
                `CSV com separador "${separator}" detectado. ` +
                    `Causa: Excel configurado para locale Português (separador padrão = ";"). ` +
                    `Solução automática: parser ajustou para "${separator}".`,
            );
        }
        return separator;
    }

    private _normalizeCsvRow(data: Record<string, string>, warnedHeaders: Set<string>): Record<string, string> {
        const nd: Record<string, string> = {};
        for (const [k, v] of Object.entries(data)) {
            const nk = normalizeFieldName(k);
            nd[nk] = sanitizeCellValue(v);
            if (nk !== k && !warnedHeaders.has(k)) {
                warnedHeaders.add(k);
                rootLogger.warn(
                    `Coluna "${k}" normalizada para "${nk}". ` +
                        `Causa: nome de coluna não padronizado. ` +
                        `Solução: use "${nk}" no header do CSV. ` +
                        `Este aviso aparece apenas uma vez por nome de coluna.`,
                );
            }
        }
        return nd;
    }

    private _parseBulkCsvTitle(lines: string[]): string | null {
        const titleLine = lines.find((l) => l.startsWith('Title:'));
        if (!titleLine) return null;
        return titleLine.replace('Title:', '').trim();
    }

    private async _buildBulkCsvTestResult(
        csvString: string,
        title: string,
        description: string,
        precValue: string | null,
        lines: string[],
    ): Promise<TestCase> {
        const steps = await this.readCsvFromString(csvString);
        const precondition = this.parsePrecondition(precValue) ?? undefined;
        const group = this.parseGroup(lines) ?? undefined;
        return {
            title,
            description,
            ...(precondition ? { precondition } : {}),
            linkedIssues: this.parseLinkedIssues(lines),
            ...(group ? { group } : {}),
            steps,
        };
    }

    private async _processBulkCsvBlock(block: string, results: TestCase[]): Promise<void> {
        const lines = block.split('\n').map((l) => l.trim());

        const title = this._parseBulkCsvTitle(lines);
        if (!title) {
            const isFlat = CsvResource.FLAT_CSV_PATTERNS.some((p) => lines[0] && p.test(lines[0]));
            if (isFlat) {
                rootLogger.warn(
                    'Bloco ignorado: formato flat detectado (CSV header na primeira linha, sem "Title:" / "---"). ' +
                        'Causa: o parser espera o formato bulk com "Title:" (dois-pontos) e blocos separados por "---". ' +
                        'Solução: converta seu CSV para o formato bulk — veja test_steps_template.csv ' +
                        'na raiz do projeto.',
                );
            } else {
                rootLogger.warn('Pulando bloco sem Title:\n' + block);
            }
            return;
        }

        const descIndex = lines.findIndex((l) => l.startsWith('Description:'));
        const { description, descEndIndex } =
            descIndex !== -1
                ? this._parseBulkCsvDescription(lines, descIndex, title)
                : { description: '', descEndIndex: descIndex + 1 };

        const precIndex = lines.findIndex((l) => l.startsWith('Pre-condition:'));
        const { precValue, precEndIndex } =
            precIndex !== -1
                ? this._parseBulkCsvPrecondition(lines, precIndex, title)
                : { precValue: null, precEndIndex: precIndex + 1 };

        const csvString = this._filterBulkCsvLines(lines, descIndex, descEndIndex, precIndex, precEndIndex);

        try {
            const testCase = await this._buildBulkCsvTestResult(csvString, title, description, precValue, lines);
            results.push(testCase);
        } catch (error: unknown) {
            const err = error as Error;
            rootLogger.error(`Erro ao analisar bloco CSV "${title}": ${err.message}`);
            throw error;
        }
    }

    async readBulkCsv(filePath: string): Promise<TestCase[]> {
        let raw = await fs.promises.readFile(filePath, 'utf-8');
        raw = raw.replace(/^\uFEFF/, ''); /* strip BOM */
        raw = raw.replace(/\r\n/g, '\n'); /* normalize CRLF → LF for block splitting */

        const blocks = raw
            .split(/^---$/m)
            .map((b) => b.trim())
            .filter((b) => b.length > 0);

        const results: TestCase[] = [];

        for (const block of blocks) {
            await this._processBulkCsvBlock(block, results);
        }

        return results;
    }
}

export default CsvResource;
