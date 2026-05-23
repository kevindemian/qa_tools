import fs from 'fs';
import path from 'path';
import Config from '../shared/config';
import { load } from '../shared/state';
import { rootLogger } from '../shared/logger';
import { info, isQuiet } from '../shared/prompt';
import type { TestCase } from '../shared/types';

const UTF8_ENCODING = 'utf8';

interface MappingEntry {
    title: string;
    key: string;
    description?: string;
    precondition?: string;
    steps?: Array<{ Action: string; Data: string; ExpectedResult: string }>;
}

class MappingFileGenerator {
    generate(sourcePath: string, projectName: string, tasksId: string[], tests: TestCase[]): void {
        const cypressDir = Config.cypressProjectPath || (load().lastCypressPath as string | undefined);
        if (!cypressDir || !tasksId.length) return;

        const baseName = path.basename(sourcePath, path.extname(sourcePath));
        const outDir = path.resolve(cypressDir);

        try {
            if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
            }
        } catch {
            rootLogger.warn('Não foi possível criar diretório de saida: ' + outDir);
            return;
        }

        const createdTests = tests.slice(0, tasksId.length);
        const mappings = this._buildMappings(tasksId, createdTests);

        this._writeJsonMapping(outDir, baseName, sourcePath, projectName, mappings);
        this._writeMdMapping(outDir, baseName, sourcePath, mappings);
        this._writeSummaryTxt(outDir, baseName, tasksId, createdTests);
    }

    private _buildMappings(tasksId: string[], tests: TestCase[]): MappingEntry[] {
        return tasksId.map((key, i) => {
            const test = tests[i] || ({} as TestCase);
            const m: MappingEntry = { title: test.title || '', key };
            if (test.description) m.description = test.description;
            if (test.precondition && test.precondition.value) {
                m.precondition = test.precondition.value;
            }
            if (test.steps && test.steps.length > 0) {
                m.steps = test.steps.map((s) => ({
                    Action: s.fields?.Action || '',
                    Data: s.fields?.Data || '',
                    ExpectedResult: s.fields?.ExpectedResult || '',
                }));
            }
            return m;
        });
    }

    private _writeJsonMapping(
        outDir: string,
        baseName: string,
        sourcePath: string,
        projectName: string,
        mappings: MappingEntry[],
    ): void {
        const jsonPath = path.join(outDir, baseName + '-jira-mapping.json');
        const jsonContent = JSON.stringify(
            {
                project: projectName,
                source: baseName + path.extname(sourcePath),
                csv: baseName + '.csv',
                timestamp: new Date().toISOString(),
                tests: mappings,
            },
            null,
            2,
        );
        fs.writeFileSync(jsonPath, jsonContent, UTF8_ENCODING);
        if (!isQuiet()) {
            info('Mapeamento salvo: ' + path.basename(jsonPath));
        }
    }

    private _writeMdMapping(outDir: string, baseName: string, sourcePath: string, mappings: MappingEntry[]): void {
        const mdPath = path.join(outDir, baseName + '-jira-mapping.md');
        let mdContent =
            '# Mapeamento Jira: ' +
            baseName +
            path.extname(sourcePath) +
            '\n' +
            '*Gerado em ' +
            new Date().toLocaleString('pt-BR') +
            '*\n\n';

        for (const m of mappings) {
            mdContent += '## ' + m.key + ' — ' + m.title + '\n\n';
            if (m.description) mdContent += '**Descrição:** ' + m.description + '\n\n';
            if (m.precondition) mdContent += '**Pre-condition:** ' + m.precondition + '\n\n';
            if (m.steps && m.steps.length > 0) {
                mdContent += '| # | Action | Data | Expected Result |\n';
                mdContent += '|---|--------|------|-----------------|\n';
                m.steps.forEach((s, i) => {
                    mdContent += '| ' + (i + 1) + ' | ' + s.Action + ' | ' + s.Data + ' | ' + s.ExpectedResult + ' |\n';
                });
            }
            mdContent += '\n---\n\n';
        }

        fs.writeFileSync(mdPath, mdContent, UTF8_ENCODING);
        if (!isQuiet()) {
            info('Sumario salvo: ' + path.basename(mdPath));
        }
    }

    private _writeSummaryTxt(outDir: string, baseName: string, tasksId: string[], tests: TestCase[]): void {
        const txtPath = path.join(outDir, baseName + '-summary.txt');
        const txtContent =
            tasksId
                .map((key, i) => {
                    const test = tests[i] || ({} as TestCase);
                    return key + ': ' + (test.title || '(sem titulo)');
                })
                .join('\n') + '\n';
        fs.writeFileSync(txtPath, txtContent, UTF8_ENCODING);
    }
}

export = MappingFileGenerator;
