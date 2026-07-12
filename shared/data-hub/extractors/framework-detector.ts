/**
 * Framework Detector Extractor — cascade detection.
 *
 * Detection cascade:
 * 1. Trees API → discover manifest files
 * 2. Contents API → read package.json
 * 3. Config files → read known config files for additional clues
 * 4. CI workflow files → read CI config for framework hints
 * 5. Fallback → unknown with 0 confidence
 */
import type { GitProvider, FrameworkDetectionResult } from '../../types/ci-cd.js';
import { detectFrameworkFromAPI } from '../../framework-detection.js';
import { rootLogger } from '../../logger.js';
import { ExternalError, getErrorMessage } from '../../errors.js';
import { warn } from '../../prompt-format.js';

/**
 * Framework Detector — runs the full cascade to detect test framework.
 *
 * Uses Trees API to discover files, then reads package.json for dependencies.
 * 404 (arquivo ausente) cai para unknown. Erros de auth/permissão/rede/servidor
 * são apresentados ao usuário via `warn` (TUI) — não silenciados.
 *
 * @param gitProvider - GitProvider with getFileContents and listDirectory
 * @param ref - Git ref (branch, tag, or SHA)
 * @returns Detected framework with confidence level
 */
export async function detectFrameworkCascade(gitProvider: GitProvider, ref: string): Promise<FrameworkDetectionResult> {
    try {
        const result = await detectFrameworkFromAPI(gitProvider, ref);
        if (result.confidence > 0) {
            rootLogger.debug(`Framework detected via package.json: ${result.framework} (${result.confidence})`);
            return result;
        }

        rootLogger.debug('Framework detection cascade: package.json failed, returning unknown');
        return { framework: 'unknown', confidence: 0 };
    } catch (err) {
        if (
            err instanceof ExternalError &&
            (err.kind === 'auth' ||
                err.kind === 'permission' ||
                err.kind === 'rateLimit' ||
                err.kind === 'network' ||
                err.kind === 'server')
        ) {
            const remediation = err.remediation ? ` — ${err.remediation}` : '';
            warn(`Falha ao ler arquivo do repositório (${err.kind}): ${err.message}${remediation}`);
        } else {
            rootLogger.debug(`Framework detection cascade failed: ${getErrorMessage(err)}`);
        }
        return { framework: 'unknown', confidence: 0 };
    }
}
