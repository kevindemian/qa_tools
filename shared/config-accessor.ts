import { ensureDotenv, envVal, toBool, toInt } from './env-utils';
import type { ConfigOverrides } from './types';
import { CONFIG_SCHEMA } from './config-schema';
import { validateRequiredEnv } from './config-validator';

class Config {
    private static defaultInstance: Config = new Config();
    private readonly overrides: ConfigOverrides;

    private constructor(overrides: ConfigOverrides = {}) {
        this.overrides = overrides;
    }

    static create(overrides?: ConfigOverrides): Config {
        return new Config(overrides);
    }
    static setAutoConfirm(v: boolean): void {
        Config.defaultInstance.setAutoConfirm(v);
    }
    setAutoConfirm(v: boolean): void {
        this.overrides.autoConfirm = v as never;
    }
    static validateRequiredEnv(): void {
        validateRequiredEnv();
    }
    static reset(): void {
        Config.defaultInstance = new Config();
    }
    static getDefault(): Config {
        return Config.defaultInstance;
    }

    private _resolve<T = string>(key: string): T {
        const ov = (this.overrides as Record<string, unknown>)[key];
        if (ov !== undefined) return ov as T;
        const f = CONFIG_SCHEMA.find((r) => r.key === key);
        if (!f) return envVal(key) as T;
        const raw = envVal(f.envVar, String(f.defaultVal ?? ''));
        if (f.key === 'xrayMode' && raw !== 'server' && raw !== 'cloud')
            throw new Error(`Invalid XRAY_MODE: "${raw}". Must be "server" or "cloud".`);
        if (f.key === 'logDir' && envVal('QA_TOOLS_LOGS_DIR')) return envVal('QA_TOOLS_LOGS_DIR') as T;
        if (f.type === 'boolean') return toBool(raw) as T;
        if (f.type === 'number') return toInt(raw, f.defaultVal as number) as T;
        return raw as T;
    }

    get jiraBaseUrl(): string {
        return this._resolve('jiraBaseUrl');
    }
    get jiraPersonalToken(): string {
        return this._resolve('jiraPersonalToken');
    }
    get xrayBaseUrl(): string {
        return this._resolve('xrayBaseUrl');
    }
    get xrayMode(): 'server' | 'cloud' {
        return this._resolve<'server' | 'cloud'>('xrayMode');
    }
    get xrayClientId(): string {
        return this._resolve('xrayClientId');
    }
    get xrayClientSecret(): string {
        return this._resolve('xrayClientSecret');
    }
    get xrayCloudUrl(): string {
        return this._resolve('xrayCloudUrl');
    }
    get jiraProject(): string {
        return this._resolve('jiraProject');
    }
    get gitToken(): string {
        return this._resolve('gitToken');
    }
    get gitBaseUrl(): string {
        return this._resolve('gitBaseUrl');
    }
    get githubToken(): string {
        return this._resolve('githubToken');
    }
    get githubApiUrl(): string {
        return this._resolve('githubApiUrl');
    }
    get cypressProjectPath(): string {
        return this._resolve('cypressProjectPath');
    }
    get csvDefaultPath(): string {
        return this._resolve('csvDefaultPath');
    }
    get autoChoice(): string {
        return this._resolve('autoChoice');
    }
    get onError(): string {
        return this._resolve('onError');
    }
    get csvPath(): string {
        return this._resolve('csvPath');
    }
    get csvLabels(): string {
        return this._resolve('csvLabels');
    }
    get jsonPath(): string {
        return this._resolve('jsonPath');
    }
    get jsonLabels(): string {
        return this._resolve('jsonLabels');
    }
    get logLevel(): string {
        return this._resolve('logLevel');
    }
    get logDir(): string {
        return this._resolve('logDir');
    }
    get xdgStateHome(): string {
        return this._resolve('xdgStateHome');
    }
    get llmApiKey(): string {
        return this._resolve('llmApiKey');
    }
    get llmModel(): string {
        return this._resolve('llmModel');
    }
    get llmBaseUrl(): string {
        return this._resolve('llmBaseUrl');
    }
    get llmSmallApiKey(): string {
        return this._resolve('llmSmallApiKey');
    }
    get llmSmallModel(): string {
        return this._resolve('llmSmallModel');
    }
    get llmFastApiKey(): string {
        return this._resolve('llmFastApiKey');
    }
    get llmFastModel(): string {
        return this._resolve('llmFastModel');
    }
    get llmFastBaseUrl(): string {
        return this._resolve('llmFastBaseUrl');
    }
    get llmReviewApiKey(): string {
        return this._resolve('llmReviewApiKey');
    }
    get llmReviewModel(): string {
        return this._resolve('llmReviewModel');
    }
    get llmReviewBaseUrl(): string {
        return this._resolve('llmReviewBaseUrl');
    }
    get llmFallbackApiKey(): string {
        return this._resolve('llmFallbackApiKey');
    }
    get llmFallbackModel(): string {
        return this._resolve('llmFallbackModel');
    }
    get llmFallbackBaseUrl(): string {
        return this._resolve('llmFallbackBaseUrl');
    }
    get llmBatchApiKey(): string {
        return this._resolve('llmBatchApiKey');
    }
    get llmBatchModel(): string {
        return this._resolve('llmBatchModel');
    }
    get llmBatchBaseUrl(): string {
        return this._resolve('llmBatchBaseUrl');
    }
    get llmMaxTokens(): number {
        return this._resolve<number>('llmMaxTokens');
    }
    get llmMaxTotalTokens(): number {
        return this._resolve<number>('llmMaxTotalTokens');
    }
    get knownIssuesPath(): string {
        return this._resolve('knownIssuesPath');
    }
    get autoConfirm(): boolean {
        return this._resolve<boolean>('autoConfirm');
    }
    get dryRun(): boolean {
        return this._resolve<boolean>('dryRun');
    }
    get debug(): boolean {
        return this._resolve<boolean>('debug');
    }
    get quiet(): boolean {
        return this._resolve<boolean>('quiet');
    }
    get logFile(): boolean {
        return this._resolve<boolean>('logFile');
    }
    get logMaxSize(): number {
        return this._resolve<number>('logMaxSize');
    }

    get(key: string): string | undefined {
        ensureDotenv();
        const o = this.overrides as Record<string, string | number | boolean | undefined>;
        if (Object.prototype.hasOwnProperty.call(o, key)) {
            const v = o[key];
            if (v === undefined) return '';
            if (typeof v === 'string') return v;
            if (v === true) return 'true';
            if (v === false) return 'false';
            return String(v);
        }
        return process.env[key];
    }

    getAllPrefixed(prefix: string): Record<string, string> {
        ensureDotenv();
        const r: Record<string, string> = {};
        for (const [k, v] of Object.entries(process.env)) if (k.startsWith(prefix) && v) r[k] = v;
        return r;
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
    static get xrayClientId(): string {
        return Config.defaultInstance.xrayClientId;
    }
    static get xrayClientSecret(): string {
        return Config.defaultInstance.xrayClientSecret;
    }
    static get xrayCloudUrl(): string {
        return Config.defaultInstance.xrayCloudUrl;
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
    static get logDir(): string {
        return Config.defaultInstance.logDir;
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
    static get llmMaxTokens(): number {
        return Config.defaultInstance.llmMaxTokens;
    }
    static get llmMaxTotalTokens(): number {
        return Config.defaultInstance.llmMaxTotalTokens;
    }
    static get knownIssuesPath(): string {
        return Config.defaultInstance.knownIssuesPath;
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
    static get logFile(): boolean {
        return Config.defaultInstance.logFile;
    }
    static get logMaxSize(): number {
        return Config.defaultInstance.logMaxSize;
    }
}

Config.load();
export default Config;
