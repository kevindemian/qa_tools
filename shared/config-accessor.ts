import { ensureDotenv, envVal, toBool, toInt } from './env-loader.js';
import type { ConfigOverrides } from './types.js';
import { CONFIG_SCHEMA } from './config-schema.js';
import { validateRequiredEnv } from './config-validator.js';

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
        this.overrides['autoConfirm'] = v;
    }
    static set(key: string, value: string | boolean | number): void {
        Reflect.set(Config.defaultInstance.overrides, key, value);
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
    static load(): void {
        ensureDotenv();
    }

    private _resolve<T = string>(key: string): T {
        const overrideEntries = Object.entries(this.overrides);
        const ovEntry = overrideEntries.find(([k]) => k === key);
        const ov = ovEntry?.[1];
        if (ov !== undefined) return ov as T;
        const f = CONFIG_SCHEMA.find((r) => r.key === key);
        if (!f) return envVal(key) as T;
        const raw = envVal(f.envVar, String(f.defaultVal ?? ''));
        if (f.allowedValues && f.allowedValues.length > 0 && raw !== '' && !f.allowedValues.includes(raw)) {
            throw new Error(`${f.envVar}="${raw}" não é um valor válido. Permitidos: ${f.allowedValues.join(', ')}.`);
        }
        if (f.key === 'logDir' && envVal('QA_TOOLS_LOGS_DIR')) return envVal('QA_TOOLS_LOGS_DIR') as T;
        if (f.type === 'boolean') return toBool(raw) as T;
        if (f.type === 'number') return toInt(raw, f.defaultVal as number) as T;
        return raw as T;
    }

    static get<T = string>(key: string): T {
        return Config.defaultInstance._resolve<T>(key);
    }
    get<T = string>(key: string): T {
        return this._resolve<T>(key);
    }

    set(key: string, value: string | boolean | number): void {
        Reflect.set(this.overrides, key, value);
    }

    getAllPrefixed(prefix: string): Record<string, string> {
        ensureDotenv();
        const entries: [string, string][] = [];
        for (const [k, v] of Object.entries(process.env)) if (k.startsWith(prefix) && v) entries.push([k, v]);
        return Object.fromEntries(entries);
    }
    static getAllPrefixed(prefix: string): Record<string, string> {
        return Config.defaultInstance.getAllPrefixed(prefix);
    }
}

Config.load();
export default Config;
