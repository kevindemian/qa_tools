/** Issue Picker — UX: free-typing + GET validation + confirmation.
 *
 *  Single responsibility: pick existing issue key(s). The user types the
 *  key(s) (comma separated), each key is validated via
 *  `GET issue/KEY?fields=summary,issuetype`, the result is shown as
 *  `KEY — "summary" (issuetype)` and confirmed with s/N.
 *
 *  This module NEVER picks a link type nor the inward/outward direction: the
 *  link type and direction are properties of the semantic operation, decided
 *  by the caller on `IssueLinkService` (single source of truth). The picker
 *  only returns the validated target keys. */
import { formatErr } from '../../shared/errors.js';

export interface IssuePickerDeps {
    getIssue: (key: string) => Promise<{ key: string; fields?: { summary?: string; issuetype?: { name?: string } } }>;
    ask: (label: string, options?: { default?: string }) => Promise<string>;
    askConfirm: (label: string, defaultYes?: boolean) => Promise<boolean>;
    warn: (msg: string) => void;
    info: (msg: string) => void;
}

export interface PickedIssue {
    key: string;
    summary: string;
    issuetype: string;
}

/** Options for the key-picking UX. */
export interface PickIssueKeysOptions {
    /** Label shown in the confirmation prompt (e.g. 'Test Coverage'). */
    confirmLabel?: string;
}

const KEY_PATTERN = /^[A-Za-z]+-\d+$/;

/** Result of picking target keys, or null when aborted.
 *  Null is the only "no-op" outcome and is always accompanied by an explicit
 *  warn/log (§25) — never a silent default. */
export async function pickIssueKeys(deps: IssuePickerDeps, opts?: PickIssueKeysOptions): Promise<string[] | null> {
    const raw = await deps.ask('Issue(s) alvo (separar por vírgula, ex: ECSPOL-731,ECSPOL-732)');
    const keys = splitKeys(raw);
    if (keys.length === 0) {
        deps.warn('Nenhuma issue informada. Operação cancelada.');
        return null;
    }

    const picked: PickedIssue[] = [];
    for (const key of keys) {
        if (!KEY_PATTERN.test(key)) {
            deps.warn(`Formato de key inválido: "${key}". Use o formato PROJ-123.`);
            continue;
        }
        const issue = await validateIssue(deps, key);
        if (issue) picked.push(issue);
    }

    if (picked.length === 0) {
        deps.warn('Nenhuma issue válida confirmada. Nenhuma ação será executada.');
        return null;
    }

    for (const p of picked) {
        deps.info(`${p.key} — "${p.summary}" (${p.issuetype})`);
    }

    const list = picked.map((p) => p.key).join(', ');
    const label = opts?.confirmLabel && opts.confirmLabel.trim() ? opts.confirmLabel.trim() : 'link';
    const ok = await deps.askConfirm(`Confirmar ${label} para ${list}?`);
    if (!ok) {
        deps.warn('Confirmação negada. Nenhuma ação será executada.');
        return null;
    }

    return picked.map((p) => p.key);
}

/** Validate a single issue key exists and returns its summary/issuetype.
 *  Missing/invalid keys produce an explicit warn (no hard fail, §3/§25). */
async function validateIssue(deps: IssuePickerDeps, key: string): Promise<PickedIssue | null> {
    try {
        const issue = await deps.getIssue(key);
        const summary = issue?.fields?.summary ?? '';
        const issuetype = issue?.fields?.issuetype?.name ?? '';
        if (!issue?.key) {
            deps.warn(`Issue ${key} não retornou chave válida — ignorada.`);
            return null;
        }
        return { key: issue.key, summary, issuetype };
    } catch (err) {
        deps.warn(`Issue ${key} não encontrada: ${formatErr(err)} — ignorada.`);
        return null;
    }
}

/** Split a raw input into trimmed, upper-cased keys, dropping empties. */
function splitKeys(raw: string): string[] {
    if (typeof raw !== 'string' || !raw.trim()) return [];
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const part of raw.split(',')) {
        const k = part.trim().toUpperCase();
        if (!k) continue;
        if (seen.has(k)) continue;
        seen.add(k);
        keys.push(k);
    }
    return keys;
}
