import type { CsvRow } from '../csv-import-schema.js';
import type { TestCase } from '../../shared/types.js';

export class CsvResource {
    static detectSeparator = vi.fn<(firstLine: string) => string>().mockReturnValue(',');

    static readonly FLAT_CSV_PATTERNS = [/^Title,Action/i, /^Action,/i];

    readCsvFromString = vi.fn<(csvString: string) => Promise<CsvRow[]>>();
    parseDescription = vi.fn<(lines: string[]) => string>();
    parseGroup = vi.fn<(lines: string[]) => string | null>();
    parsePrecondition =
        vi.fn<(value: string | null | undefined) => { type: 'reference' | 'inline'; value: string } | null>();
    parseLinkedIssues = vi.fn<(lines: string[]) => Array<{ key: string; linkType: string }>>();
    readBulkCsv = vi.fn<(filePath: string) => Promise<TestCase[]>>();
}

export default CsvResource;
