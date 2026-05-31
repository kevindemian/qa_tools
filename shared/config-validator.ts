const REQUIRED_ENV: Array<{ key: string; label: string }> = [
    { key: 'JIRA_BASE_URL', label: 'Jira base URL' },
    { key: 'JIRA_PERSONAL_TOKEN', label: 'Jira personal token' },
    { key: 'XRAY_BASE_URL', label: 'Xray base URL' },
];

export function validateRequiredEnv(): void {
    for (const r of REQUIRED_ENV) {
        if (!process.env[r.key]) {
            throw new Error(`${r.label} (${r.key}) não definido. Configure no .env ou exporte a variável.`);
        }
    }
}
