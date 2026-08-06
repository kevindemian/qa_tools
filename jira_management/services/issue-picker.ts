/** Issue Picker — UX: free-typing + GET validation + confirmation.
 *
 *  The user types the issue key(s) (comma separated), each key is validated via
 *  `GET issue/KEY?fields=summary,issuetype`, the result is shown as
 *  `KEY — "summary" (issuetype)` and confirmed with s/N. The link type is chosen
 *  from the finite set of issue link types via `showSelect`.
 *
 *  This module NEVER picks inward/outward direction: it returns the target keys
 *  and the link type; the semantic operation (with the correct direction) is
 *  delegated to `IssueLinkService` by the caller. */
import type { SelectChoice } from '../../shared/ui/prompt-input-inquirer.js';
import { formatErr } from '../../shared/errors.js';

export interface IssuePickerDeps {
    listLinkTypes: () => Promise<Array<{ id: string; name?: string; inward?: string; outward?: string }>>;
    getIssue: (key: string) => Promise<{ key: string; fields?: { summary?: string; issuetype?: { name?: string } } }>;
    ask: (label: string, options?: { default?: string }) => Promise<string>;
    showSelect: (label: string, choices: SelectChoice[], options?: { pageSize?: number }) => Promise<string>;
    askConfirm: (label: string, defaultYes?: boolean) => Promise<boolean>;
    warn: (msg: string) => void;
    info: (msg: string) => void;
}

export interface PickedIssue {
    key: string;
    summary: string;
    issuetype: string;
}

export interface PickedIssueAndLinkType {
    keys: string[];
    linkType: string;
}

const KEY_PATTERN = /^[A-Za-z]+-\d+$/;

/** Result of picking: target keys + link type, or null when aborted.
 *  Null is the only "no-op" outcome and is always accompanied by an explicit
 *  warn/log (§25) — never a silent default. */
export async function pickIssueAndLinkType(deps: IssuePickerDeps): Promise<PickedIssueAndLinkType | null> {
    const linkType = await pickLinkType(deps);
    if (!linkType) return null;

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
        deps.warn('Nenhuma issue válida confirmada. Nenhum link será criado.');
        return null;
    }

    for (const p of picked) {
        deps.info(`${p.key} — "${p.summary}" (${p.issuetype})`);
    }

    const list = picked.map((p) => p.key).join(', ');
    const ok = await deps.askConfirm(`Confirmar link ${linkType} para ${list}?`);
    if (!ok) {
        deps.warn('Confirmação negada. Nenhum link será criado.');
        return null;
    }

    return { keys: picked.map((p) => p.key), linkType };
}

/** Menu of link types via `showSelect`. Returns the chosen type name or null. */
async function pickLinkType(deps: IssuePickerDeps): Promise<string | null> {
    let types: Array<{ id: string; name?: string; inward?: string; outward?: string }>;
    try {
        types = await deps.listLinkTypes();
    } catch (err) {
        deps.warn('Falha ao listar tipos de link: ' + formatErr(err));
        return null;
    }
    if (!Array.isArray(types) || types.length === 0) {
        deps.warn('Nenhum tipo de link disponível. Operação cancelada.');
        return null;
    }
    const choices: SelectChoice[] = types
        .map((t) => ({ name: t.name, value: t.name ?? t.id }))
        .filter((c): c is { name: string; value: string } => Boolean(c.name));
    const chosen = await deps.showSelect('Tipo de link:', choices);
    if (!chosen || chosen === '0' || chosen === '__error__') {
        deps.warn('Nenhum tipo de link selecionado. Operação cancelada.');
        return null;
    }
    return chosen;
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
