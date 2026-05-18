const fs = require('fs');
const path = require('path');
const readlineSync = require('readline-sync');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const defaultFilePath = process.env.CYPRESS_RESULTS_DEFAULT_PATH;
const resultsFilePath = readlineSync.question(`\nInsert Cypress results file path [default: ${defaultFilePath}]: `, { defaultInput: defaultFilePath });

fs.readFile(resultsFilePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading file:', err);
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

        const [skipped, pending, passed, failed] = lastFour;

        totalPassed += passed;
        totalFailed += failed;

        // console.log(`\n--- Block ${index + 1} ---`);
        // console.log(`Skipped: ${skipped}`);
        // console.log(`Pending: ${pending}`);
        // console.log(`Passed: ${passed}`);
        // console.log(`Failed: ${failed}`);
    });

    const avgPassed = totalPassed / blocks.length;
    const avgFailed = totalFailed / blocks.length;
    const totalTests = totalPassed + totalFailed;
    const percentPassed = (totalPassed / totalTests) * 100;

    // Output
    console.log(`   Average Passed: ${avgPassed.toFixed(2)}`);
    console.log(`   Average Failed: ${avgFailed.toFixed(2)}`);
    console.log(`   % Passed: ${percentPassed.toFixed(2)}%`);
});