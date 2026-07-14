import fs from 'fs';
import path from 'path';
import { rootLogger } from '../shared/logger.js';
import { getErrorMessage } from '../shared/errors.js';

/** Maximum size of a config file we are willing to read. Larger files are
 * skipped to avoid a denial-of-service via a huge fixture. */
export const MAX_CONFIG_BYTES = 1024 * 1024;

/**
 * Read a project config file with symlink containment and size guards.
 *
 * Returns the UTF-8 content, or `null` when the file is absent, cannot be
 * resolved, escapes `projectRoot` via a symlink, or exceeds `MAX_CONFIG_BYTES`.
 *
 * `null` is an EXPLICIT "safe to skip" sentinel — it is not a silent error.
 * The caller treats absence as "no reporter configured here". Every branch
 * that yields `null` is logged at debug level so detection is never invisible.
 */
export async function readConfigFileSafe(projectRoot: string, relativeName: string): Promise<string | null> {
    const resolvedRoot = await safeRealpath(projectRoot);
    if (resolvedRoot === null) {
        rootLogger.debug(`readConfigFileSafe: cannot resolve projectRoot ${projectRoot}`);
        return null;
    }

    const filePath = path.resolve(resolvedRoot, relativeName);
    const resolvedFile = await safeRealpath(filePath);
    if (resolvedFile === null) {
        // Absent (or broken symlink). Absence is not an error.
        return null;
    }

    // Symlink containment: the resolved file MUST live under the resolved root.
    if (resolvedFile !== resolvedRoot && !resolvedFile.startsWith(resolvedRoot + path.sep)) {
        rootLogger.debug(`readConfigFileSafe: refusing ${filePath} — escapes projectRoot`);
        return null;
    }

    let stat: fs.Stats;
    try {
        stat = await fs.promises.stat(resolvedFile);
    } catch (err) {
        rootLogger.debug(`readConfigFileSafe: stat failed for ${filePath}: ${getErrorMessage(err)}`);
        return null;
    }
    if (!stat.isFile()) return null;

    if (stat.size > MAX_CONFIG_BYTES) {
        rootLogger.debug(
            `readConfigFileSafe: skipping ${filePath} — ${stat.size} bytes exceeds ${MAX_CONFIG_BYTES} limit`,
        );
        return null;
    }

    try {
        return await fs.promises.readFile(resolvedFile, 'utf8');
    } catch (err) {
        rootLogger.debug(`readConfigFileSafe: cannot read ${filePath}: ${getErrorMessage(err)}`);
        return null;
    }
}

async function safeRealpath(p: string): Promise<string | null> {
    try {
        return await fs.promises.realpath(p);
    } catch {
        return null;
    }
}
