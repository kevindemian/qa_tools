/**
 * Camada de Insights — tipos base.
 *
 * A separação insight→render (Fase 1) só é válida se o insight tiver um
 * contrato validável. `Insight` é o tipo base consumido por todos os pilotos
 * (defect-trend, coverage-gap, pr-report).
 *
 * Regra 25: ausência de dados deve ser explícita no `detail`/`entities`, nunca
 * silenciosa. Regra 24: valores numéricos em `entities[].value` devem ser
 * finitos (schema rejeita NaN/Infinity/null).
 *
 * @module insights/types
 */

/** Severidade do insight — ordem de urgência para render e triagem. */
export type InsightSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** Categoria do insight — identifica o piloto produtor. */
export type InsightCategory = 'defect-trend' | 'coverage-gap' | 'pr-report';

/** Entidade referenciada por um insight (teste, categoria, epic, issue, run). */
export interface InsightEntity {
    /** Nome da entidade (ex.: categoria 'UNKNOWN', teste 'TC01 - Login valido'). */
    name: string;
    /** Tipo da entidade (ex.: 'category' | 'test' | 'epic' | 'issue' | 'run'). */
    type: string;
    /** Valor numérico associado (contagem, percentual). Deve ser finito. */
    value?: number;
}

/** Contrato base de um insight. */
export interface Insight {
    /** Identificador estável (ex.: 'defect-trend:2026-06-03:UNKNOWN'). */
    id: string;
    /** Severidade (enum validado pelo schema). */
    severity: InsightSeverity;
    /** Categoria (enum validado pelo schema). */
    category: InsightCategory;
    /** Resumo de uma linha (não vazio, Regra 25). */
    summary: string;
    /** Descrição detalhada da observação e contexto. */
    detail: string;
    /** Proveniência da fonte (ex.: 'github-actions/run/31085474282/artifact/pr-report-html'). */
    source: string;
    /** Entidades referenciadas (vazio por default). */
    entities?: InsightEntity[];
    /** Timestamp determinístico de geração (ISO-8601) via resolveGeneratedAt(seed). */
    generatedAt: string;
}
