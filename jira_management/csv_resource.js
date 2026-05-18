const fs = require('fs');
const csv = require('csv-parser');
const { Readable } = require('stream');

class CsvResource {

    // Function to read CSV file and convert to JSON
    readCsvToJson(filePath) {
        return new Promise((resolve, reject) => {
            const results = [];

            fs.createReadStream(filePath)
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

    // Reusable: read CSV from string
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

    // Bulk CSV reader (Title + steps blocks)
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
                console.warn('Skipping block without Title:\n', block);
                continue;
            }

            const title = titleLine.replace('Title:', '').trim();

            const csvLines = lines.filter(l => !l.startsWith('Title:'));
            const csvString = csvLines.join('\n');

            try {
                const steps = await this.readCsvFromString(csvString);

                results.push({
                    title,
                    steps
                });

            } catch (error) {
                console.error(`Error parsing CSV block for "${title}":`, error);
                throw error;
            }
        }

        return results;
    }
}

module.exports = CsvResource;