const SECRET_PATTERNS: RegExp[] = [
    /bearer\s+[a-zA-Z0-9\-._~+/]+/gi,
    /-----BEGIN\s?(RSA\s?)?PRIVATE\s?KEY-----[\s\S]*?-----END\s?(RSA\s?)?PRIVATE\s?KEY-----/gi,
    /-----BEGIN\s?CERTIFICATE-----[\s\S]*?-----END\s?CERTIFICATE-----/gi,
    /sk-[a-zA-Z0-9]{20,}/g,
    /ghp_[a-zA-Z0-9]{36,}/g,
    /gho_[a-zA-Z0-9]{36,}/g,
    /github_pat_[a-zA-Z0-9]{22,}/g,
    /AIza[0-9A-Za-z_-]{35,}/g,
    /(?:https?:\/\/)?[^@\s]+:[^@\s]+@/g,
    /hf_[a-zA-Z0-9]{20,}/g,
    /npm_[a-zA-Z0-9]{36,}/g,
    /xox[abp]-[a-zA-Z0-9-]{20,}/g,
    /ghr_[a-zA-Z0-9]{36,}/g,
];

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
    if (maxStackLines !== undefined) {
        result = truncateStacktrace(result, maxStackLines);
    }
    return result;
}

export function truncateStacktrace(input: string, maxLines: number = 20): string {
    const lines = input.split('\n');
    if (lines.length <= maxLines) return input;
    return lines.slice(0, maxLines).join('\n') + '\n[... truncated (' + (lines.length - maxLines) + ' more lines) ...]';
}
