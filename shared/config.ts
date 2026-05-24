import * as path from 'path';

let dotenvLoaded = false;

function ensureDotenv(): void {
    if (dotenvLoaded) return;
    const _origWrite = process.stdout.write.bind(process.stdout);
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (process.stdout as any).write = () => true;
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
    } catch {
        /* env file optional */
    } finally {
        process.stdout.write = _origWrite;
    }
    dotenvLoaded = true;
}

function envVal(key: string, fallback = ''): string {
    ensureDotenv();
    return process.env[key] || fallback;
}

class Config {
    static create(): Config {
        return new Config();
    }

    // ── Instance API ─────────────────────────────────────────────────────────

    // ── Static API (delegates to default instance) ────────────────────────────

    static get jiraBaseUrl(): string {
        return envVal('JIRA_BASE_URL');
    }
    static get jiraPersonalToken(): string {
        return envVal('JIRA_PERSONAL_TOKEN');
    }
    static get xrayBaseUrl(): string {
        return envVal('XRAY_BASE_URL');
    }
    static get jiraProject(): string {
        return envVal('JIRA_PROJECT', 'ECSPOL');
    }

    static get gitToken(): string {
        return envVal('GIT_TOKEN');
    }
    static get gitBaseUrl(): string {
        return envVal('GIT_BASE_URL');
    }
    static get githubToken(): string {
        return envVal('GITHUB_TOKEN');
    }
    static get githubApiUrl(): string {
        return envVal('GITHUB_API_URL', 'https://api.github.com');
    }

    static get cypressProjectPath(): string {
        return envVal('CYPRESS_PROJECT_PATH');
    }
    static get csvDefaultPath(): string {
        return envVal('CSV_DEFAULT_PATH');
    }

    static get autoChoice(): string {
        return envVal('AUTO_CHOICE');
    }
    static get autoConfirm(): boolean {
        return envVal('AUTO_CONFIRM') === 'true';
    }
    static get dryRun(): boolean {
        return envVal('DRY_RUN') === 'true';
    }
    static get debug(): boolean {
        return envVal('DEBUG') === 'true';
    }
    static get quiet(): boolean {
        return envVal('QUIET') === 'true';
    }
    static get onError(): string {
        return envVal('ON_ERROR', 'abort');
    }

    static get csvPath(): string {
        return envVal('CSV_PATH');
    }
    static get csvLabels(): string {
        return envVal('CSV_LABELS');
    }
    static get jsonPath(): string {
        return envVal('JSON_PATH');
    }
    static get jsonLabels(): string {
        return envVal('JSON_LABELS');
    }

    static get logLevel(): string {
        return envVal('LOG_LEVEL', 'INFO');
    }
    static get logFile(): boolean {
        return envVal('LOG_FILE') === 'true';
    }
    static get logDir(): string {
        return envVal('LOG_DIR', 'logs');
    }
    static get logMaxSize(): number {
        const n = parseInt(envVal('LOG_MAX_SIZE'), 10);
        return isNaN(n) ? 5 * 1024 * 1024 : n;
    }

    static get xdgStateHome(): string {
        return envVal('XDG_STATE_HOME');
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
