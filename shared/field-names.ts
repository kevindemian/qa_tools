/** Field name normalization — canonical mapping for CSV headers and JSON step fields.
 * Handles Portuguese-locale quirks (CRLF, BOM, semicolons) and common naming variants.
 * All public functions are pure and side-effect-free. */
const CANONICAL: Record<string, string> = {
    action: 'Action',
    data: 'Data',
    expectedresult: 'Expected Result',
};

/** Normalize a CSV column header or JSON field name to its canonical form.
 * Strips trailing `\r` (CRLF residue), trims, lowercases, collapses
 * spaces/underscores/hyphens, then maps via the CANONICAL table.
 * Returns the cleaned original if no mapping exists. */
export function normalizeFieldName(raw: string): string {
    const cleaned = raw.replace(/\r/g, '').trim();
    const key = cleaned.toLowerCase().replace(/[\s_-]+/g, '');
    return CANONICAL[key] ?? cleaned;
}

/** Sanitize a cell value: strip trailing `\r` (CRLF residue) but preserve intentional `\n`
 * (e.g. multi-line quoted CSV values). */
export function sanitizeCellValue(v: string | null | undefined): string {
    return (v ?? '').replace(/\r/g, '');
}
