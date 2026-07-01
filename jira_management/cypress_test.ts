import fs from 'fs';
import path from 'path';
import { ensureDotenv } from '../shared/env-loader.js';
import { rootLogger } from '../shared/logger.js';

ensureDotenv();

interface CypressParseResult {
    avgPassed: number;
    avgFailed: number;
    percentPassed: number;
}

function computeAverages(data: string): CypressParseResult {
    const blocks = data.split("Merge branch 'rel_cand' into 'main'").filter(Boolean);

    let totalPassed = 0;
    let totalFailed = 0;

    if (blocks.length === 0) {
        return { avgPassed: 0, avgFailed: 0, percentPassed: 0 };
    }

    blocks.forEach((block, index) => {
        const lines = block.trim().split('\n');
        const numbers = lines
            .map((line) => line.trim())
            .filter((line) => /^\d+$/.test(line))
            .map(Number);
        const lastFour = numbers.slice(-4);

        if (lastFour.length !== 4) {
            rootLogger.warn(`Skipping block ${index + 1}: not enough numeric lines`);
            return;
        }

        const passed = lastFour[2] ?? 0;
        const failed = lastFour[3] ?? 0;
        totalPassed += passed;
        totalFailed += failed;
    });

    const avgPassed = totalPassed / blocks.length;
    const avgFailed = totalFailed / blocks.length;
    const totalTests = totalPassed + totalFailed;
    const percentPassed = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;

    return {
        avgPassed: parseFloat(avgPassed.toFixed(2)),
        avgFailed: parseFloat(avgFailed.toFixed(2)),
        percentPassed: parseFloat(percentPassed.toFixed(2)),
    };
}

class CypressTest {
    reportDir: string;

    constructor(reportDir: string) {
        this.reportDir = reportDir;
    }

    parseResults(filePath: string): Promise<CypressParseResult> {
        return new Promise((resolve, reject) => {
            fs.readFile(path.resolve(filePath), 'utf8', (err, data) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(computeAverages(data));
            });
        });
    }
}

export default CypressTest;
