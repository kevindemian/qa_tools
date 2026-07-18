import type { FlatTest } from '../result_parser.js';

export interface ExportOptions {
    delimiter?: string;
}

function escapeCsvField(value: string): string {
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

export function exportTestsCsv(tests: FlatTest[], options?: ExportOptions): string {
    const delimiter = options?.delimiter || ',';
    const headers = ['#', 'Test', 'Status', 'Duration', 'Suite', 'Error'];
    const lines: string[] = [headers.map((h) => escapeCsvField(h)).join(delimiter)];
    for (const [i, t] of tests.entries()) {
        const suite = t.fullTitle ? t.fullTitle.split(' > ').slice(0, -1).join(' > ') : '';
        const row = [String(i + 1), t.title, t.state, String(t.duration), suite, t.error || ''];
        lines.push(row.map((v) => escapeCsvField(v)).join(delimiter));
    }
    return lines.join('\n');
}

export function exportTestsJson(tests: FlatTest[]): string {
    return JSON.stringify(tests, null, 2);
}
