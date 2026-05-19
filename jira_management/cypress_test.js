const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

class CypressTest {
    parseResults(filePath) {
        return new Promise((resolve, reject) => {
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    reject(err);
                    return;
                }

                const blocks = data.split("Merge branch 'rel_cand' into 'main'").filter(Boolean);

                let totalPassed = 0;
                let totalFailed = 0;

                blocks.forEach((block, index) => {
                    const lines = block.trim().split('\n');
                    const numbers = lines.map(line => line.trim()).filter(line => /^\d+$/.test(line)).map(Number);
                    const lastFour = numbers.slice(-4);

                    if (lastFour.length !== 4) {
                        console.warn(`Skipping block ${index + 1}: not enough numeric lines`);
                        return;
                    }

                    const [, , passed, failed] = lastFour;
                    totalPassed += passed;
                    totalFailed += failed;
                });

                const avgPassed = totalPassed / blocks.length;
                const avgFailed = totalFailed / blocks.length;
                const totalTests = totalPassed + totalFailed;
                const percentPassed = (totalPassed / totalTests) * 100;

                resolve({
                    avgPassed: parseFloat(avgPassed.toFixed(2)),
                    avgFailed: parseFloat(avgFailed.toFixed(2)),
                    percentPassed: parseFloat(percentPassed.toFixed(2))
                });
            });
        });
    }
}

module.exports = CypressTest;
