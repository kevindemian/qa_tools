export const NO_TASKS_FOUND_FOR_VERSION = 'Nenhuma tarefa encontrada para esta versão.';

export function noIssuesFoundForVersion(versionName: string, projectName: string): string {
    return `Nenhuma issue encontrada para versão '${versionName}' no projeto '${projectName}'.`;
}

export function noVersionFoundForProject(projectName: string): string {
    return `Nenhuma versão encontrada para o projeto '${projectName}'.`;
}

export function projectNotFound(projectName: string): string {
    return `Projeto '${projectName}' não encontrado.`;
}

export const OPERATION_CANCELLED = 'Operação cancelada.';

export const NOT_CONFIGURED = 'não configurado';

export const ERR_ADD_TASKS_TO_SPRINT = 'Erro ao adicionar tarefas a sprint';
