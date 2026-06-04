/**
 * Dependency Wall — single source of truth for all external runtime dependencies.
 *
 * Every module in the project MUST import external packages through this file only.
 * This enables:
 * - Centralized dependency audit (open this file = see all runtime deps)
 * - Swapping implementations (change 1 file instead of N)
 * - Tracking which deps are actually used
 *
 * ESM-only packages (gradient-string, ora, @inquirer/*) are NOT listed here
 * because they're loaded via dynamic import() in their respective wrapper modules
 * (splash.ts, spinner.ts, prompt-input-inquirer.ts) — they're already isolated.
 *
 * @module deps
 */
import chalk = require('chalk');
import axios = require('axios');
import AdmZip = require('adm-zip');
import cliProgress = require('cli-progress');
import CliTable3 = require('cli-table3');
import csv = require('csv-parser');
import dotenv = require('dotenv');
import figlet = require('figlet');
import readlineSync = require('readline-sync');
import yaml = require('yaml');
import zod = require('zod');

export { chalk, axios, AdmZip, cliProgress, CliTable3, csv, dotenv, figlet, readlineSync, yaml, zod };

/* glob is lazy-required to avoid Jest ESM parse failures (glob v10+ transitively loads path-scurry TS sources) */
type GlobSyncFn = (pattern: string, options?: { cwd?: string }) => string[];
type GlobModule = { globSync: GlobSyncFn };

let _glob: GlobModule | null = null;
function requireGlob(): GlobModule {
    if (!_glob) _glob = require('glob') as GlobModule;
    return _glob;
}

export function getGlob(): GlobModule {
    return requireGlob();
}
export function globSync(pattern: string, options?: { cwd?: string }): string[] {
    if (options !== undefined) return requireGlob().globSync(pattern, options);
    return requireGlob().globSync(pattern);
}

/* yaml named exports (preserve both value and type via export import) */
export import Document = yaml.Document;
export import YAMLMap = yaml.YAMLMap;
export import YAMLSeq = yaml.YAMLSeq;
export import Scalar = yaml.Scalar;
export import Pair = yaml.Pair;
export const { isMap, parseDocument } = yaml;

export type { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
export type { Node } from 'yaml';

/** Re-export z from zod for schema definitions. */
export { z } from 'zod';
