// @ts-check
const fs = require('fs');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { rootLogger } = require('../shared/logger');

const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+$/;

class CsvResource {

    readCsvFromString(csvString) {
        return new Promise((resolve, reject) => {
            const results = [];

            const stream = Readable.from([csvString]);

            stream
                .pipe(csv())
                .on('data', (data) => {
                    results.push({
                        fields: {
                            Action: data.Action || "",
                            Data: data.Data || "",
                            "Expected Result": data["Expected Result"] || ""
                        }
                    });
                })
                .on('end', () => resolve(results))
                .on('error', reject);
        });
    }

    parseDescription(lines) {
        const line = lines.find(l => l.startsWith('Description:'));
        return line ? line.replace('Description:', '').trim() : '';
    }

    parseGroup(lines) {
        const line = lines.find(l => l.startsWith('Group:'));
        if (!line) return null;
        const value = line.replace('Group:', '').trim();
        return value || null;
    }

    /** @param {string|null|undefined} value @returns {{ type: 'reference'|'inline', value: string } | null} */
    parsePrecondition(value) {
        if (!value) return null;
        const trimmed = value.trim();
        if (!trimmed) return null;

        const KEY_MATCH = /^([A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+)/;
        const keyMatch = trimmed.match(KEY_MATCH);

        if (keyMatch) {
            return { type: 'reference', value: keyMatch[1] };
        }

        return { type: 'inline', value: trimmed };
    }

    parseLinkedIssues(lines) {
        const line = lines.find(l => l.startsWith('Linked Issues:'));
        if (!line) return [];

        const value = line.replace('Linked Issues:', '').trim();
        if (!value) return [];

        const LINKED_ISSUE_PATTERN = /(\w+-\d+)\s*\(([^)]+)\)/g;
        const results = [];
        let match;

        while ((match = LINKED_ISSUE_PATTERN.exec(value)) !== null) {
            results.push({
                key: match[1],
                linkType: match[2].trim()
            });
        }

        return results;
    }

    /** @param {string} filePath @returns {Promise<import('../shared/types').TestCase[]>} */
    async readBulkCsv(filePath) {
        const raw = fs.readFileSync(filePath, 'utf-8');

        const blocks = raw
            .split(/^---$/m)
            .map(b => b.trim())
            .filter(b => b.length > 0);

        const results = [];

        for (const block of blocks) {
            const lines = block
                .split('\n')
                .map(l => l.trim());

            const titleLine = lines.find(l => l.startsWith('Title:'));

            if (!titleLine) {
                rootLogger.warn('Pulando bloco sem Title:\n' + block);
                continue;
            }

            const title = titleLine.replace('Title:', '').trim();

            const descIndex = lines.findIndex(l => l.startsWith('Description:'));
            let descEndIndex = descIndex + 1;
            let description = '';

            if (descIndex !== -1) {
                const rawValue = lines[descIndex].replace(/^Description:\s*/, '');

                if (rawValue.startsWith('"') && rawValue.endsWith('"') && rawValue.length >= 2) {
                    // Single-line quoted: extract between quotes
                    description = rawValue.slice(1, -1).replace(/""/g, '"');

                } else if (rawValue.startsWith('"')) {
                    // Multi-line quoted: find closing " on subsequent lines
                    const parts = [rawValue.slice(1)];

                    while (descEndIndex < lines.length) {
                        const line = lines[descEndIndex];
                        if (line.endsWith('"')) {
                            parts.push(line.slice(0, -1));
                            descEndIndex++;
                            break;
                        }
                        parts.push(line);
                        descEndIndex++;
                    }

                    if (descEndIndex >= lines.length) {
                        rootLogger.warn(`Description sem aspas de fechamento: "${title}"`);
                    }

                    description = parts.join('\n').replace(/""/g, '"');

                } else {
                    // Range mode: capture until next metadata header or Action,Data
                    const stopPrefixes = ['Title:', 'Pre-condition:', 'Linked Issues:', 'Group:', 'Action,Data'];
                    while (descEndIndex < lines.length) {
                        if (stopPrefixes.some(p => lines[descEndIndex].startsWith(p))) break;
                        descEndIndex++;
                    }

                    const parts = [];
                    for (let i = descIndex; i < descEndIndex; i++) {
                        if (i === descIndex) {
                            parts.push(lines[i].replace(/^Description:\s*/, ''));
                        } else {
                            parts.push(lines[i]);
                        }
                    }
                    description = parts.join('\n');
                }
            }

            const precIndex = lines.findIndex(l => l.startsWith('Pre-condition:'));
            let precEndIndex = precIndex + 1;
            let precValue = null;

            if (precIndex !== -1) {
                const rawValue = lines[precIndex].replace(/^Pre-condition:\s*/, '');

                if (rawValue.startsWith('"') && rawValue.endsWith('"') && rawValue.length >= 2) {
                    precValue = rawValue.slice(1, -1).replace(/""/g, '"');

                } else if (rawValue.startsWith('"')) {
                    const parts = [rawValue.slice(1)];
                    while (precEndIndex < lines.length) {
                        const line = lines[precEndIndex];
                        if (line.endsWith('"')) {
                            parts.push(line.slice(0, -1));
                            precEndIndex++;
                            break;
                        }
                        parts.push(line);
                        precEndIndex++;
                    }
                    if (precEndIndex >= lines.length) {
                        rootLogger.warn(`Pre-condition sem aspas de fechamento: "${title}"`);
                    }
                    precValue = parts.join('\n').replace(/""/g, '"');

                } else {
                    precValue = rawValue;
                }
            }

            const metadataPrefixes = ['Title:', 'Description:', 'Pre-condition:', 'Linked Issues:', 'Group:'];
            const csvLines = lines.filter((l, i) => {
                if (metadataPrefixes.some(p => l.startsWith(p))) return false;
                if (i > descIndex && i < descEndIndex) return false;
                if (precIndex !== -1 && i >= precIndex && i < precEndIndex) return false;
                return l.length > 0 && !l.startsWith('#');
            });
            const csvString = csvLines.join('\n');

            try {
                const steps = await this.readCsvFromString(csvString);

                results.push({
                    title,
                    description,
                    precondition: this.parsePrecondition(precValue) ?? undefined,
                    linkedIssues: this.parseLinkedIssues(lines),
                    group: this.parseGroup(lines),
                    steps
                });

            } catch (error) {
                rootLogger.error(`Erro ao analisar bloco CSV "${title}": ${error.message}`);
                throw error;
            }
        }

        return results;
    }
}

module.exports = CsvResource;
