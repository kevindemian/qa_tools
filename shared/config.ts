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

function envVal(key: string, fallback = ''): string {
    ensureDotenv();
    return process.env[key] || fallback;
}

interface ConfigOverrides {
    jiraBaseUrl?: string;
    jiraPersonalToken?: string;
    xrayBaseUrl?: string;
    xrayMode?: string;
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
    llmApiKey?: string;
    llmModel?: string;
    llmBaseUrl?: string;
    llmSmallApiKey?: string;
    llmSmallModel?: string;
    llmFastApiKey?: string;
    llmFastModel?: string;
    llmFastBaseUrl?: string;
    llmReviewApiKey?: string;
    llmReviewModel?: string;
    llmReviewBaseUrl?: string;
    llmFallbackApiKey?: string;
    llmFallbackModel?: string;
    llmFallbackBaseUrl?: string;
    llmBatchApiKey?: string;
    llmBatchModel?: string;
    llmBatchBaseUrl?: string;
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

    static getDefault(): Config {
        return Config.defaultInstance;
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
    get xrayMode(): 'server' | 'cloud' {
        const val = this.overrides.xrayMode ?? envVal('XRAY_MODE', 'server');
        if (val !== 'server' && val !== 'cloud') {
            throw new Error(`Invalid XRAY_MODE: "${val}". Must be "server" or "cloud".`);
        }
        return val;
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
        return this.overrides.logDir || envVal('QA_TOOLS_LOGS_DIR') || envVal('LOG_DIR', 'logs');
    }
    get logMaxSize(): number {
        return toInt(this.overrides.logMaxSize ?? envVal('LOG_MAX_SIZE'), 5 * 1024 * 1024);
    }

    get xdgStateHome(): string {
        return this.overrides.xdgStateHome ?? envVal('XDG_STATE_HOME');
    }

    // ── LLM getters ────────────────────────────────────────────────────────

    get llmApiKey(): string {
        return this.overrides.llmApiKey ?? envVal('LLM_API_KEY');
    }
    get llmModel(): string {
        return this.overrides.llmModel ?? envVal('LLM_MODEL', 'google/gemini-2.0-flash-exp');
    }
    get llmBaseUrl(): string {
        return this.overrides.llmBaseUrl ?? envVal('LLM_BASE_URL', 'https://openrouter.ai/api/v1');
    }
    get llmSmallApiKey(): string {
        return this.overrides.llmSmallApiKey ?? envVal('LLM_SMALL_API_KEY');
    }
    get llmSmallModel(): string {
        return this.overrides.llmSmallModel ?? envVal('LLM_SMALL_MODEL', 'gemini-2.0-flash-lite');
    }

    // ── Fast (Groq) ──────────────────────────────────────────────────────
    get llmFastApiKey(): string {
        return this.overrides.llmFastApiKey ?? envVal('LLM_FAST_API_KEY');
    }
    get llmFastModel(): string {
        return this.overrides.llmFastModel ?? envVal('LLM_FAST_MODEL', 'llama-3.1-8b-instant');
    }
    get llmFastBaseUrl(): string {
        return this.overrides.llmFastBaseUrl ?? envVal('LLM_FAST_BASE_URL', 'https://api.groq.com/openai/v1');
    }

    // ── Reviewer (Gemini Pro) ────────────────────────────────────────────
    get llmReviewApiKey(): string {
        return this.overrides.llmReviewApiKey ?? envVal('LLM_REVIEW_API_KEY');
    }
    get llmReviewModel(): string {
        return this.overrides.llmReviewModel ?? envVal('LLM_REVIEW_MODEL', 'gemini-2.0-flash-exp');
    }
    get llmReviewBaseUrl(): string {
        return (
            this.overrides.llmReviewBaseUrl ??
            envVal('LLM_REVIEW_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta')
        );
    }

    // ── Fallback (NVIDIA NIM) ────────────────────────────────────────────
    get llmFallbackApiKey(): string {
        return this.overrides.llmFallbackApiKey ?? envVal('LLM_FALLBACK_API_KEY');
    }
    get llmFallbackModel(): string {
        return this.overrides.llmFallbackModel ?? envVal('LLM_FALLBACK_MODEL', 'meta/llama3-70b-instruct');
    }
    get llmFallbackBaseUrl(): string {
        return (
            this.overrides.llmFallbackBaseUrl ?? envVal('LLM_FALLBACK_BASE_URL', 'https://integrate.api.nvidia.com/v1')
        );
    }

    // ── Batch (GitHub Models) ────────────────────────────────────────────
    get llmBatchApiKey(): string {
        return this.overrides.llmBatchApiKey ?? envVal('LLM_BATCH_API_KEY');
    }
    get llmBatchModel(): string {
        return this.overrides.llmBatchModel ?? envVal('LLM_BATCH_MODEL', 'gpt-4o-mini');
    }
    get llmBatchBaseUrl(): string {
        return this.overrides.llmBatchBaseUrl ?? envVal('LLM_BATCH_BASE_URL', 'https://models.inference.ai.azure.com');
    }

    get(key: string): string | undefined {
        ensureDotenv();
        const overrideKey = key as keyof ConfigOverrides;
        if (overrideKey in this.overrides) {
            const val = this.overrides[overrideKey];
            if (typeof val === 'string') return val;
            if (val === true) return 'true';
            if (val === false) return 'false';
            return String(val ?? '');
        }
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

    static get(key: string): string | undefined {
        return Config.defaultInstance.get(key);
    }

    static getAllPrefixed(prefix: string): Record<string, string> {
        return Config.defaultInstance.getAllPrefixed(prefix);
    }

    static load(): void {
        Config.defaultInstance.load();
    }

    // ── Static getter delegators ──────────────────────────────────────────

    static get jiraBaseUrl(): string {
        return Config.defaultInstance.jiraBaseUrl;
    }
    static get jiraPersonalToken(): string {
        return Config.defaultInstance.jiraPersonalToken;
    }
    static get xrayBaseUrl(): string {
        return Config.defaultInstance.xrayBaseUrl;
    }
    static get xrayMode(): 'server' | 'cloud' {
        return Config.defaultInstance.xrayMode;
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
    static get llmApiKey(): string {
        return Config.defaultInstance.llmApiKey;
    }
    static get llmModel(): string {
        return Config.defaultInstance.llmModel;
    }
    static get llmBaseUrl(): string {
        return Config.defaultInstance.llmBaseUrl;
    }
    static get llmSmallApiKey(): string {
        return Config.defaultInstance.llmSmallApiKey;
    }
    static get llmSmallModel(): string {
        return Config.defaultInstance.llmSmallModel;
    }
    static get llmFastApiKey(): string {
        return Config.defaultInstance.llmFastApiKey;
    }
    static get llmFastModel(): string {
        return Config.defaultInstance.llmFastModel;
    }
    static get llmFastBaseUrl(): string {
        return Config.defaultInstance.llmFastBaseUrl;
    }
    static get llmReviewApiKey(): string {
        return Config.defaultInstance.llmReviewApiKey;
    }
    static get llmReviewModel(): string {
        return Config.defaultInstance.llmReviewModel;
    }
    static get llmReviewBaseUrl(): string {
        return Config.defaultInstance.llmReviewBaseUrl;
    }
    static get llmFallbackApiKey(): string {
        return Config.defaultInstance.llmFallbackApiKey;
    }
    static get llmFallbackModel(): string {
        return Config.defaultInstance.llmFallbackModel;
    }
    static get llmFallbackBaseUrl(): string {
        return Config.defaultInstance.llmFallbackBaseUrl;
    }
    static get llmBatchApiKey(): string {
        return Config.defaultInstance.llmBatchApiKey;
    }
    static get llmBatchModel(): string {
        return Config.defaultInstance.llmBatchModel;
    }
    static get llmBatchBaseUrl(): string {
        return Config.defaultInstance.llmBatchBaseUrl;
    }
}

Config.load();

export default Config;
