import fs from 'fs';
import path from 'path';

const tmpDir = path.join(process.cwd(), '.tmp', 'qa-store-backend-test');
fs.mkdirSync(tmpDir, { recursive: true });
