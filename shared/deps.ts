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
import chalk from 'chalk';
import axios from 'axios';
import AdmZip from 'adm-zip';
import cliProgress from 'cli-progress';
import CliTable3 from 'cli-table3';
import csv from 'csv-parser';
import dotenv from 'dotenv';
import figlet from 'figlet';
import readlineSync from 'readline-sync';
import yaml from 'yaml';
import zod from 'zod';
import { globSync } from 'glob';
import fc from 'fast-check';
import nock from 'nock';

export { chalk, axios, AdmZip, cliProgress, CliTable3, csv, dotenv, figlet, readlineSync, yaml, zod, fc, nock };

export { globSync };

export function getGlob(): { globSync: typeof globSync } {
    return { globSync };
}

/* yaml named exports (re-export classes + helpers directly) */
export { Document, YAMLMap, YAMLSeq, Scalar, Pair, isMap, parseDocument } from 'yaml';

export type { AxiosInstance } from 'axios';
export type { Node } from 'yaml';

/** Re-export z from zod for schema definitions. */
export { z } from 'zod';
