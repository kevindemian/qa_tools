import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { rootLogger } from '../shared/logger';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

interface CypressParseResult {
  avgPassed: number;
  avgFailed: number;
  percentPassed: number;
}

class CypressTest {
  reportDir: string;

  constructor(reportDir: string) {
    this.reportDir = reportDir;
  }

  parseResults(filePath: string): Promise<CypressParseResult> {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
          reject(err);
          return;
        }

        const blocks = data.split("Merge branch 'rel_cand' into 'main'").filter(Boolean);

        let totalPassed = 0;
        let totalFailed = 0;

        if (blocks.length === 0) {
          resolve({ avgPassed: 0, avgFailed: 0, percentPassed: 0 });
          return;
        }

        blocks.forEach((block, index) => {
          const lines = block.trim().split('\n');
          const numbers = lines.map(line => line.trim()).filter(line => /^\d+$/.test(line)).map(Number);
          const lastFour = numbers.slice(-4);

          if (lastFour.length !== 4) {
            rootLogger.warn(`Skipping block ${index + 1}: not enough numeric lines`);
            return;
          }

          const [, , passed, failed] = lastFour;
          totalPassed += passed;
          totalFailed += failed;
        });

        const avgPassed = totalPassed / blocks.length;
        const avgFailed = totalFailed / blocks.length;
        const totalTests = totalPassed + totalFailed;
        const percentPassed = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;

        resolve({
          avgPassed: parseFloat(avgPassed.toFixed(2)),
          avgFailed: parseFloat(avgFailed.toFixed(2)),
          percentPassed: parseFloat(percentPassed.toFixed(2)),
        });
      });
    });
  }
}

export default CypressTest;
