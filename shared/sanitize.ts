/** Input sanitisation: LLM-safe redaction, HTML escaping, and ANSI stripping. */
const SECRET_PATTERNS: RegExp[] = [
    /bearer\s+[a-zA-Z0-9._~+/-]+/gi,
    /-----BEGIN\s?RSA\s?PRIVATE\s?KEY-----[\s\S]*?-----END\s?RSA\s?PRIVATE\s?KEY-----/gi,
    /-----BEGIN\s?PRIVATE\s?KEY-----[\s\S]*?-----END\s?PRIVATE\s?KEY-----/gi,
    /-----BEGIN\s?CERTIFICATE-----[\s\S]*?-----END\s?CERTIFICATE-----/gi,
    /sk-[a-zA-Z0-9]{20,}/g,
    /ghp_[a-zA-Z0-9]{36,}/g,
    /gho_[a-zA-Z0-9]{36,}/g,
    /github_pat_[a-zA-Z0-9]{22,}/g,
    /AIza[0-9A-Za-z_-]{35,}/g,
    /hf_[a-zA-Z0-9]{20,}/g,
    /npm_[a-zA-Z0-9]{36,}/g,
    /xox[abp]-[a-zA-Z0-9-]{20,}/g,
    /ghr_[a-zA-Z0-9]{36,}/g,
];

/** Redact secrets (tokens, keys, certificates, passwords) from a string before sending to an LLM.
 * Multi-line private keys are collapsed to `[...sanitized...]`. */
export function sanitizeForLlm(input: string, maxStackLines?: number): string {
    let result = input;
    for (const pattern of SECRET_PATTERNS) {
        result = result.replace(pattern, (match) => {
            if (pattern.source.toLowerCase().includes('begin')) {
                if (match.includes('\n')) {
                    const lines = match.split('\n');
                    return lines[0] + '\n[...sanitized...]\n' + lines[lines.length - 1];
                }
                return match;
            }
            return match.slice(0, 4) + '[...sanitized]';
        });
    }
    result = redactUrlsWithCredentials(result);
    if (maxStackLines !== undefined) {
        result = truncateStacktrace(result, maxStackLines);
    }
    return result;
}

function redactUrlsWithCredentials(text: string): string {
    let result = '';
    let i = 0;
    while (i < text.length) {
        const atIdx = text.indexOf('@', i);
        if (atIdx === -1) {
            result += text.slice(i);
            break;
        }
        const colonIdx = text.lastIndexOf(':', atIdx);
        if (colonIdx > i && colonIdx < atIdx) {
            const prefix = text.lastIndexOf(' ', colonIdx);
            const start = prefix === -1 ? i : prefix + 1;
            if (start < colonIdx) {
                result += text.slice(i, start);
                result += text.slice(start, colonIdx + 1) + '[...sanitized]';
                i = atIdx + 1;
                continue;
            }
        }
        result += text.slice(i, i + 1);
        i++;
    }
    return result;
}

/** Truncate a stacktrace to `maxLines`, appending a count of omitted lines. */
export function truncateStacktrace(input: string, maxLines: number = 20): string {
    const lines = input.split('\n');
    if (lines.length <= maxLines) return input;
    return lines.slice(0, maxLines).join('\n') + '\n[... truncated (' + (lines.length - maxLines) + ' more lines) ...]';
}

export { sanitizeHtml } from './escape.js';

const ESC = String.fromCharCode(27);

/** Strip ANSI escape sequences from a string. */
export function sanitizeTerminal(text: string): string {
    let result = '';
    let i = 0;
    while (i < text.length) {
        const ch = text.charAt(i);
        const next = text.charAt(i + 1);
        if (ch === ESC && next === '[') {
            i += 2;
            while (i < text.length && text.charAt(i) >= '0' && text.charAt(i) <= ';') i++;
            if (i < text.length && text.charAt(i) >= 'A' && text.charAt(i) <= 'z') i++;
        } else {
            result += ch;
            i++;
        }
    }
    return result;
}
