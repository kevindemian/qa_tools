import * as path from 'path';

let dotenvLoaded = false;

function ensureDotenv(): void {
    if (dotenvLoaded) return;
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
    } catch {
        /* env file optional */
    }
    dotenvLoaded = true;
}

class Config {
    static get jiraBaseUrl(): string {
        ensureDotenv();
        return process.env.JIRA_BASE_URL || '';
    }
    static get jiraPersonalToken(): string {
        ensureDotenv();
        return process.env.JIRA_PERSONAL_TOKEN || '';
    }
    static get xrayBaseUrl(): string {
        ensureDotenv();
        return process.env.XRAY_BASE_URL || '';
    }
    static get jiraProject(): string {
        ensureDotenv();
        return process.env.JIRA_PROJECT || 'ECSPOL';
    }

    static get gitToken(): string {
        ensureDotenv();
        return process.env.GIT_TOKEN || '';
    }
    static get gitBaseUrl(): string {
        ensureDotenv();
        return process.env.GIT_BASE_URL || '';
    }
    static get githubToken(): string {
        ensureDotenv();
        return process.env.GITHUB_TOKEN || '';
    }
    static get githubApiUrl(): string {
        ensureDotenv();
        return process.env.GITHUB_API_URL || 'https://api.github.com';
    }

    static get cypressProjectPath(): string {
        ensureDotenv();
        return process.env.CYPRESS_PROJECT_PATH || '';
    }
    static get csvDefaultPath(): string {
        ensureDotenv();
        return process.env.CSV_DEFAULT_PATH || '';
    }

    static get autoChoice(): string {
        ensureDotenv();
        return process.env.AUTO_CHOICE || '';
    }
    static get autoConfirm(): boolean {
        ensureDotenv();
        return process.env.AUTO_CONFIRM === 'true';
    }
    static get dryRun(): boolean {
        ensureDotenv();
        return process.env.DRY_RUN === 'true';
    }
    static get debug(): boolean {
        ensureDotenv();
        return process.env.DEBUG === 'true';
    }
    static get quiet(): boolean {
        ensureDotenv();
        return process.env.QUIET === 'true';
    }
    static get onError(): string {
        ensureDotenv();
        return process.env.ON_ERROR || 'abort';
    }

    static get csvPath(): string {
        ensureDotenv();
        return process.env.CSV_PATH || '';
    }
    static get csvLabels(): string {
        ensureDotenv();
        return process.env.CSV_LABELS || '';
    }
    static get jsonPath(): string {
        ensureDotenv();
        return process.env.JSON_PATH || '';
    }
    static get jsonLabels(): string {
        ensureDotenv();
        return process.env.JSON_LABELS || '';
    }

    static get logLevel(): string {
        ensureDotenv();
        return process.env.LOG_LEVEL || 'INFO';
    }
    static get logFile(): boolean {
        ensureDotenv();
        return process.env.LOG_FILE === 'true';
    }
    static get logDir(): string {
        ensureDotenv();
        return process.env.LOG_DIR || 'logs';
    }
    static get logMaxSize(): number {
        ensureDotenv();
        const n = parseInt(process.env.LOG_MAX_SIZE || '', 10);
        return isNaN(n) ? 5 * 1024 * 1024 : n;
    }

    static get xdgStateHome(): string {
        ensureDotenv();
        return process.env.XDG_STATE_HOME || '';
    }

    static get(key: string): string | undefined {
        ensureDotenv();
        return process.env[key];
    }

    static getAllPrefixed(prefix: string): Record<string, string> {
        ensureDotenv();
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(process.env)) {
            if (key.startsWith(prefix) && value) {
                result[key] = value;
            }
        }
        return result;
    }

    static load(): void {
        ensureDotenv();
    }
}

Config.load();

export = Config;
