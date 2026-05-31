/** End-of-run summary rendered as styled boxes. */
import chalk from 'chalk';
import { rootLogger } from './logger';
import { box } from './box';
import { palette } from './palette';
import { defaultOutput as output } from './output';
import { isQuiet, success, SUMMARY_BOX_WIDTH } from './prompt-format';
import type { TestResult } from './types';

function renderQuietSummary(passed: number, failed: number, results: TestResult[]): void {
    if (failed === 0) {
        output.print('  ' + chalk.green.bold('TUDO CERTO!'));
        success(passed + ' de ' + results.length + ' operação(oes) concluída(s) com sucesso');
        return;
    }
    output.print('  ' + chalk.yellow.bold('OPERACAO PARCIAL'));
    output.print('  ' + chalk.yellow('!') + ' ' + passed + ' concluídas, ' + failed + ' com erro');
    results
        .filter((r) => r.status === 'error')
        .forEach((r) => {
            output.print('  ' + chalk.red('*') + ' ' + r.label + ': ' + r.message);
        });
    if (failed > 0) {
        const logPath = rootLogger.filePath;
        if (logPath) {
            output.print('  ' + chalk.yellow('->') + ' Consulte o log: ' + logPath);
        }
    }
}

function renderVerboseSuccess(passed: number, total: number, pct: number, testExecution?: string): void {
    const lines: string[] = [
        '',
        chalk.bold(palette.green('●  TUDO CERTO!')),
        palette.fg('●  ' + passed + ' de ' + total + ' operação(ões) concluída(s)'),
        '',
    ];
    lines.push(palette.fg('📊  ' + pct + '% pass rate'));
    if (testExecution) {
        lines.push(palette.blue('📎  Test Execution: ' + testExecution));
    }
    lines.push('');
    output.print(box(lines, { border: 'single', color: 'green', padding: 0, width: SUMMARY_BOX_WIDTH }));
}

function renderVerboseFailure(
    passed: number,
    failed: number,
    results: TestResult[],
    pct: number,
    testExecution?: string,
): void {
    const logPath = rootLogger.filePath;
    const errorLines: string[] = [
        '',
        chalk.bold(palette.yellow('●  ' + passed + ' concluídas, ' + failed + ' com erro')),
        '',
    ];
    results
        .filter((r) => r.status === 'error')
        .forEach((r) => {
            errorLines.push(palette.red('✗  ' + r.label + ': ' + r.message));
        });
    errorLines.push('');
    errorLines.push(palette.fg('📊  ' + pct + '% pass rate'));
    if (testExecution) {
        errorLines.push(palette.blue('📎  Test Execution: ' + testExecution));
    }
    errorLines.push(palette.blue('→  Consulte o log: ' + (logPath || 'ver logs acima')));
    errorLines.push('');
    output.print(box(errorLines, { border: 'single', color: 'yellow', padding: 0, width: SUMMARY_BOX_WIDTH }));
}

export function printSummary(results: TestResult[], testExecution?: string): void {
    const passed = results.filter((r) => r.status === 'ok').length;
    const failed = results.filter((r) => r.status === 'error').length;
    const pct = results.length > 0 ? Math.round((passed / results.length) * 100) : 0;

    if (isQuiet()) {
        renderQuietSummary(passed, failed, results);
    } else if (failed === 0) {
        renderVerboseSuccess(passed, results.length, pct, testExecution);
    } else {
        renderVerboseFailure(passed, failed, results, pct, testExecution);
    }

    if (failed === 0) {
        rootLogger.info('Resumo: ' + passed + '/' + results.length + ' ok');
    } else {
        rootLogger.warn(`Resumo: ${passed}/${results.length} ok, ${failed} erro(s)`);
    }
}
