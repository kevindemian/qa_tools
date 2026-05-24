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

interface ConfigOverrides {
    jiraBaseUrl?: string;
    jiraPersonalToken?: string;
    xrayBaseUrl?: string;
    jiraProject?: string;
    gitToken?: string;
    gitBaseUrl?: string;
    githubToken?: string;
    githubApiUrl?: string;
    cypressProjectPath?: string;
    csvDefaultPath?: string;
    autoChoice?: string;
    autoConfirm?: string | boolean;
    dryRun?: string | boolean;
    debug?: string | boolean;
    quiet?: string | boolean;
    onError?: string;
    csvPath?: string;
    csvLabels?: string;
    jsonPath?: string;
    jsonLabels?: string;
    logLevel?: string;
    logFile?: string | boolean;
    logDir?: string;
    logMaxSize?: string | number;
    xdgStateHome?: string;
}

function toBool(val: string | boolean | undefined): boolean {
    if (val === undefined) return false;
    if (typeof val === 'boolean') return val;
    return val === 'true';
}

function toInt(val: string | number | undefined, fallback: number): number {
    if (val === undefined) return fallback;
    if (typeof val === 'number') return val;
    const n = parseInt(val, 10);
    return isNaN(n) ? fallback : n;
}

class Config {
    private static defaultInstance: Config = new Config();

    private readonly overrides: ConfigOverrides;

    constructor(overrides: ConfigOverrides = {}) {
        this.overrides = overrides;
    }

    static create(overrides?: ConfigOverrides): Config {
        return new Config(overrides);
    }

    static reset(): void {
        Config.defaultInstance = new Config();
    }

    // ── Instance getters ───────────────────────────────────────────────────

    get jiraBaseUrl(): string {
        return this.overrides.jiraBaseUrl ?? envVal('JIRA_BASE_URL');
    }
    get jiraPersonalToken(): string {
        return this.overrides.jiraPersonalToken ?? envVal('JIRA_PERSONAL_TOKEN');
    }
    get xrayBaseUrl(): string {
        return this.overrides.xrayBaseUrl ?? envVal('XRAY_BASE_URL');
    }
    get jiraProject(): string {
        return this.overrides.jiraProject ?? envVal('JIRA_PROJECT', 'ECSPOL');
    }

    get gitToken(): string {
        return this.overrides.gitToken ?? envVal('GIT_TOKEN');
    }
    get gitBaseUrl(): string {
        return this.overrides.gitBaseUrl ?? envVal('GIT_BASE_URL');
    }
    get githubToken(): string {
        return this.overrides.githubToken ?? envVal('GITHUB_TOKEN');
    }
    get githubApiUrl(): string {
        return this.overrides.githubApiUrl ?? envVal('GITHUB_API_URL', 'https://api.github.com');
    }

    get cypressProjectPath(): string {
        return this.overrides.cypressProjectPath ?? envVal('CYPRESS_PROJECT_PATH');
    }
    get csvDefaultPath(): string {
        return this.overrides.csvDefaultPath ?? envVal('CSV_DEFAULT_PATH');
    }

    get autoChoice(): string {
        return this.overrides.autoChoice ?? envVal('AUTO_CHOICE');
    }
    get autoConfirm(): boolean {
        return toBool(this.overrides.autoConfirm ?? envVal('AUTO_CONFIRM'));
    }
    get dryRun(): boolean {
        return toBool(this.overrides.dryRun ?? envVal('DRY_RUN'));
    }
    get debug(): boolean {
        return toBool(this.overrides.debug ?? envVal('DEBUG'));
    }
    get quiet(): boolean {
        return toBool(this.overrides.quiet ?? envVal('QUIET'));
    }
    get onError(): string {
        return this.overrides.onError ?? envVal('ON_ERROR', 'abort');
    }

    get csvPath(): string {
        return this.overrides.csvPath ?? envVal('CSV_PATH');
    }
    get csvLabels(): string {
        return this.overrides.csvLabels ?? envVal('CSV_LABELS');
    }
    get jsonPath(): string {
        return this.overrides.jsonPath ?? envVal('JSON_PATH');
    }
    get jsonLabels(): string {
        return this.overrides.jsonLabels ?? envVal('JSON_LABELS');
    }

    get logLevel(): string {
        return this.overrides.logLevel ?? envVal('LOG_LEVEL', 'INFO');
    }
    get logFile(): boolean {
        return toBool(this.overrides.logFile ?? envVal('LOG_FILE'));
    }
    get logDir(): string {
        return this.overrides.logDir ?? envVal('LOG_DIR', 'logs');
    }
    get logMaxSize(): number {
        return toInt(this.overrides.logMaxSize ?? envVal('LOG_MAX_SIZE'), 5 * 1024 * 1024);
    }

    get xdgStateHome(): string {
        return this.overrides.xdgStateHome ?? envVal('XDG_STATE_HOME');
    }

    get(key: string): string | undefined {
        ensureDotenv();
        return process.env[key];
    }

    getAllPrefixed(prefix: string): Record<string, string> {
        ensureDotenv();
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(process.env)) {
            if (key.startsWith(prefix) && value) {
                result[key] = value;
            }
        }
        return result;
    }

    load(): void {
        ensureDotenv();
    }

    // ── Static API (delegates to default instance) ─────────────────────────

    static get jiraBaseUrl(): string {
        return Config.defaultInstance.jiraBaseUrl;
    }
    static get jiraPersonalToken(): string {
        return Config.defaultInstance.jiraPersonalToken;
    }
    static get xrayBaseUrl(): string {
        return Config.defaultInstance.xrayBaseUrl;
    }
    static get jiraProject(): string {
        return Config.defaultInstance.jiraProject;
    }

    static get gitToken(): string {
        return Config.defaultInstance.gitToken;
    }
    static get gitBaseUrl(): string {
        return Config.defaultInstance.gitBaseUrl;
    }
    static get githubToken(): string {
        return Config.defaultInstance.githubToken;
    }
    static get githubApiUrl(): string {
        return Config.defaultInstance.githubApiUrl;
    }

    static get cypressProjectPath(): string {
        return Config.defaultInstance.cypressProjectPath;
    }
    static get csvDefaultPath(): string {
        return Config.defaultInstance.csvDefaultPath;
    }

    static get autoChoice(): string {
        return Config.defaultInstance.autoChoice;
    }
    static get autoConfirm(): boolean {
        return Config.defaultInstance.autoConfirm;
    }
    static get dryRun(): boolean {
        return Config.defaultInstance.dryRun;
    }
    static get debug(): boolean {
        return Config.defaultInstance.debug;
    }
    static get quiet(): boolean {
        return Config.defaultInstance.quiet;
    }
    static get onError(): string {
        return Config.defaultInstance.onError;
    }

    static get csvPath(): string {
        return Config.defaultInstance.csvPath;
    }
    static get csvLabels(): string {
        return Config.defaultInstance.csvLabels;
    }
    static get jsonPath(): string {
        return Config.defaultInstance.jsonPath;
    }
    static get jsonLabels(): string {
        return Config.defaultInstance.jsonLabels;
    }

    static get logLevel(): string {
        return Config.defaultInstance.logLevel;
    }
    static get logFile(): boolean {
        return Config.defaultInstance.logFile;
    }
    static get logDir(): string {
        return Config.defaultInstance.logDir;
    }
    static get logMaxSize(): number {
        return Config.defaultInstance.logMaxSize;
    }

    static get xdgStateHome(): string {
        return Config.defaultInstance.xdgStateHome;
    }

    static get(key: string): string | undefined {
        return Config.defaultInstance.get(key);
    }

    static getAllPrefixed(prefix: string): Record<string, string> {
        return Config.defaultInstance.getAllPrefixed(prefix);
    }

    static load(): void {
        Config.defaultInstance.load();
    }
}

Config.load();

export = Config;
