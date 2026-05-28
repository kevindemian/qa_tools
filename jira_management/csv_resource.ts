import fs from 'fs';
import csv from 'csv-parser';
import { Readable } from 'stream';
import { rootLogger } from '../shared/logger';
import type { TestCase } from '../shared/types';
import { parseQuotedValue, extractPreconditionKey } from '../shared/quoted-string';
import { CsvRowSchema } from './csv-import-schema';
import type { CsvRow } from './csv-import-schema';

class CsvResource {
    readCsvFromString(csvString: string): Promise<CsvRow[]> {
        return new Promise((resolve, reject) => {
            const results: CsvRow[] = [];
            const stream = Readable.from([csvString]);

            stream
                .pipe(csv())
                .on('data', (data: Record<string, string>) => {
                    const parsed = CsvRowSchema.safeParse({
                        fields: {
                            Action: data.Action || '',
                            Data: data.Data || '',
                            'Expected Result': data['Expected Result'] || '',
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
            results.push({
                key: match[1]!,
                linkType: match[2]!.trim(),
            });
        }

        return results;
    }

    private _parseBulkCsvDescription(
        lines: string[],
        descIndex: number,
        title: string,
    ): { description: string; descEndIndex: number } {
        const rawValue = lines[descIndex]!.replace(/^Description:\s*/, '');
        const parsed = parseQuotedValue(rawValue, lines, descIndex);
        let description = parsed.value;
        let descEndIndex = parsed.endIndex;

        if (parsed.endIndex >= lines.length && rawValue.startsWith('"') && !rawValue.endsWith('"')) {
            rootLogger.warn(`Description sem aspas de fechamento: "${title}"`);
        }

        if (!rawValue.startsWith('"')) {
            const stopPrefixes = ['Title:', 'Pre-condition:', 'Linked Issues:', 'Group:', 'Action,Data'];
            while (descEndIndex < lines.length) {
                if (stopPrefixes.some((p) => lines[descEndIndex]!.startsWith(p))) break;
                descEndIndex++;
            }
            const parts: string[] = [];
            for (let i = descIndex; i < descEndIndex; i++) {
                if (i === descIndex) {
                    parts.push(lines[i]!.replace(/^Description:\s*/, ''));
                } else {
                    parts.push(lines[i]!);
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
        const rawValue = lines[precIndex]!.replace(/^Pre-condition:\s*/, '');
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

    private async _processBulkCsvBlock(block: string, results: TestCase[]): Promise<void> {
        const lines = block.split('\n').map((l) => l.trim());

        const titleLine = lines.find((l) => l.startsWith('Title:'));
        if (!titleLine) {
            rootLogger.warn('Pulando bloco sem Title:\n' + block);
            return;
        }

        const title = titleLine.replace('Title:', '').trim();

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
            const steps = await this.readCsvFromString(csvString);

            results.push({
                title,
                description,
                precondition: this.parsePrecondition(precValue) ?? undefined,
                linkedIssues: this.parseLinkedIssues(lines),
                group: this.parseGroup(lines) ?? undefined,
                steps,
            });
        } catch (error: unknown) {
            const err = error as Error;
            rootLogger.error(`Erro ao analisar bloco CSV "${title}": ${err.message}`);
            throw error;
        }
    }

    async readBulkCsv(filePath: string): Promise<TestCase[]> {
        const raw = await fs.promises.readFile(filePath, 'utf-8');

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
