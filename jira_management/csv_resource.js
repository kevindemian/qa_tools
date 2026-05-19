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

    parsePrecondition(lines) {
        const line = lines.find(l => l.startsWith('Pre-condition:'));
        if (!line) return null;

        const value = line.replace('Pre-condition:', '').trim();
        if (!value) return null;

        if (JIRA_KEY_PATTERN.test(value)) {
            return { type: 'reference', value };
        }
        return { type: 'inline', value };
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

    async readBulkCsv(filePath) {
        const raw = fs.readFileSync(filePath, 'utf-8');

        const blocks = raw
            .split('---')
            .map(b => b.trim())
            .filter(b => b.length > 0);

        const results = [];

        for (const block of blocks) {
            const lines = block
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0);

            const titleLine = lines.find(l => l.startsWith('Title:'));

            if (!titleLine) {
                rootLogger.warn('Pulando bloco sem Title:\n' + block);
                continue;
            }

            const title = titleLine.replace('Title:', '').trim();

            const metadataPrefixes = ['Title:', 'Description:', 'Pre-condition:', 'Linked Issues:', 'Group:'];
            const csvLines = lines.filter(l => !metadataPrefixes.some(p => l.startsWith(p)));
            const csvString = csvLines.join('\n');

            try {
                const steps = await this.readCsvFromString(csvString);

                results.push({
                    title,
                    description: this.parseDescription(lines),
                    precondition: this.parsePrecondition(lines),
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
