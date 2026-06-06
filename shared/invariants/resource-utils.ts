const CREATE_RESOURCE_RE = /\b(?:create|register|new|criar|registrar|adicionar)\s+(\w+)/i;
const DELETE_RESOURCE_RE = /\b(?:delete|remove|destroy|erase|excluir|remover|deletar)\s+(\w+)/i;

const COMMON_WORDS = new Set([
    'fill',
    'form',
    'page',
    'link',
    'item',
    'list',
    'view',
    'edit',
    'save',
    'cancel',
    'submit',
    'formulario',
    'dados',
    'nome',
    'email',
    'senha',
    'valor',
    'arquivo',
]);

function extractCreateResource(text: string): string | null {
    const match = CREATE_RESOURCE_RE.exec(text);
    const name = match?.[1];
    if (name && !COMMON_WORDS.has(name.toLowerCase())) return name;
    return null;
}

function extractDeleteResource(text: string): string | null {
    const match = DELETE_RESOURCE_RE.exec(text);
    const name = match?.[1];
    if (name && !COMMON_WORDS.has(name.toLowerCase())) return name;
    return null;
}

export function testCoupling(stepsA: string, stepsB: string): boolean {
    const created = extractCreateResource(stepsA);
    const deleted = extractDeleteResource(stepsB);
    if (created && deleted && created.toLowerCase() === deleted.toLowerCase()) return true;
    const createdB = extractCreateResource(stepsB);
    const deletedA = extractDeleteResource(stepsA);
    if (createdB && deletedA && createdB.toLowerCase() === deletedA.toLowerCase()) return true;
    return false;
}
