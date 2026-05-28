/** User-facing messages for version/project operations. */
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

export function versionNotFoundInProject(versionName: string, projectName: string): string {
    return `Versão '${versionName}' não encontrada no projeto '${projectName}'.`;
}

export function versionAlreadyExists(versionName: string): string {
    return `Versão '${versionName}' ja existe.`;
}

export function creatingVersion(versionName: string): string {
    return `Criando versão: ${versionName}`;
}

export function versionCreated(name: string): string {
    return 'Versão criada com sucesso: ' + name;
}

export const FAILED_TO_CREATE_VERSION = 'Falha ao criar versão.';

export function publishingVersion(versionName: string): string {
    return `Publicando versão '${versionName}'...`;
}

export function versionPublished(versionName: string): string {
    return `Versão '${versionName}' publicada.`;
}

export function addingTasksToSprint(count: number, sprintId: string): string {
    return `Adicionando ${count} tarefa(s) a sprint ${sprintId}...`;
}

export const TASKS_ADDED_TO_SPRINT = 'Tarefas adicionadas a sprint.';

export function errorAddingToSprint(errMsg: string): string {
    return 'Erro ao adicionar a sprint: ' + errMsg;
}

export function versionNotFoundForProject(versionName: string, projectName: string): string {
    return `Versão '${versionName}' não encontrada no projeto '${projectName}'.`;
}

export function issueNotCompleted(issueKey: string, status: string): string {
    return ` - Issue '${issueKey}' NÃO concluída. Status: ${status}`;
}

export function issueCompleted(issueKey: string, status: string): string {
    return ` - Issue '${issueKey}' concluída (Status: ${status}).`;
}

export function latestVersions(count: number, projectName: string): string {
    return `Últimas ${count} versões lançadas do projeto '${projectName}':`;
}

export function unreleasedVersions(projectName: string): string {
    return "\nVersões não lançadas do projeto '" + projectName + "':";
}

export const NO_UNRELEASED_VERSIONS = 'Nenhuma versão não lançada encontrada.';

export function skippingTask(taskId: string): string {
    return `Pulando tarefa ${taskId}: não foi possível obter dados.`;
}

export function taskIncompleteData(taskId: string): string {
    return `Pulando tarefa ${taskId}: dados incompletos.`;
}

export function taskCurrentStatus(taskId: string, status: string): string {
    return `Tarefa ${taskId} — status atual: ${status}`;
}

export function noTransitions(taskId: string): string {
    return `Não foi possível obter transições para ${taskId}. Pulando tarefa.`;
}

export function statusNotMapped(taskId: string, status: string): string {
    return `   ${taskId}: status "${status}" não mapeado para fechamento automático.`;
}

export function transitionNotFound(transitionName: string, taskId: string): string {
    return `Transição "${transitionName}" não encontrada para ${taskId}. Verifique workflowMap.`;
}

export function errorMovingTask(taskId: string, errMsg: string): string {
    return `Erro ao mover ${taskId}: ${errMsg}`;
}

export function errorMovingTaskShort(errMsg: string): string {
    return 'Erro ao mover tarefa: ' + errMsg;
}

export const OPERATION_CANCELLED = 'Operação cancelada.';

export const NOT_CONFIGURED = 'não configurado';

export const ERR_ADD_TASKS_TO_SPRINT = 'Erro ao adicionar tarefas a sprint';

export const FAILED_TO_GET_ISSUE_TYPES = 'Falha ao obter tipos de issue do Jira';

export const FAILED_TO_GET_CUSTOM_FIELDS = 'Falha ao obter campos customizados do Jira';

export const ISSUE_TYPE_NOT_FOUND =
    'Issue type "Test Execution" não encontrado. Verifique se o Xray esta instalado e o issue type existe no scheme do projeto.';

export const CUSTOM_FIELD_NOT_FOUND =
    'Campo "Tests association with a Test Execution" não encontrado. Verifique se o Xray esta instalado corretamente.';
