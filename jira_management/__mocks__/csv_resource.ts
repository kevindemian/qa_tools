import { jest } from '@jest/globals';
import type { CsvRow } from '../csv-import-schema';
import type { TestCase } from '../../shared/types';

export class CsvResource {
    static detectSeparator = jest.fn<(firstLine: string) => string>().mockReturnValue(',');

    static readonly FLAT_CSV_PATTERNS = [/^Title,Action/i, /^Action,/i];

    readCsvFromString = jest.fn<(csvString: string) => Promise<CsvRow[]>>();
    parseDescription = jest.fn<(lines: string[]) => string>();
    parseGroup = jest.fn<(lines: string[]) => string | null>();
    parsePrecondition =
        jest.fn<(value: string | null | undefined) => { type: 'reference' | 'inline'; value: string } | null>();
    parseLinkedIssues = jest.fn<(lines: string[]) => Array<{ key: string; linkType: string }>>();
    readBulkCsv = jest.fn<(filePath: string) => Promise<TestCase[]>>();
}

export default CsvResource;
