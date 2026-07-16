/** Generate mapping JSON files that link test titles to Jira issue keys after import. */
import { formatErr } from '../shared/errors.js';
import fs from 'fs';
import path from 'path';
import { info, isQuiet } from '../shared/prompt.js';
import { reportsDir } from '../shared/temp-dir.js';
import type { TestCase } from '../shared/types.js';
import { generatePreviewMarkdown } from './import-prep.js';

interface MappingEntry {
    title: string;
    key: string;
    description?: string;
    precondition?: string;
    steps?: Array<{
        Action: string;
        Data: string;
        /** @production Field name com espaço exigido pela Xray Server API. */ 'Expected Result': string;
    }>;
}

function emptyTestCase(): TestCase {
    return { title: '', steps: [] };
}

class MappingFileGenerator {
    generate(sourcePath: string, projectName: string, tasksId: string[], tests: TestCase[]): void {
        if (!tasksId.length) return;

        const baseName = path.basename(sourcePath, path.extname(sourcePath));
        const outDir = reportsDir();

        try {
            if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
            }
        } catch (err: unknown) {
            throw new Error('Falha ao criar diretório de saída dos mapeamentos (' + outDir + '): ' + formatErr(err), {
                cause: err,
            });
        }

        const createdTests = tests.slice(0, tasksId.length);
        const mappings = this._buildMappings(tasksId, createdTests);

        try {
            this._writeJsonMapping(outDir, baseName, sourcePath, projectName, mappings);
            this._writeMdMapping(outDir, baseName, sourcePath, createdTests, tasksId);
            this._writeSummaryTxt(outDir, baseName, tasksId, createdTests);
        } catch (err: unknown) {
            throw new Error('Falha ao escrever arquivos de mapeamento: ' + formatErr(err), { cause: err });
        }
    }

    private _buildMappings(tasksId: string[], tests: TestCase[]): MappingEntry[] {
        return tasksId.map((key, i) => {
            const test = (Reflect.get(tests, i) as TestCase | undefined) || emptyTestCase();
            const m: MappingEntry = { title: test.title || '', key };
            if (test.description) m.description = test.description;
            if (test.precondition && test.precondition.length > 0) {
                m.precondition = test.precondition.map((p) => p.value).join(', ');
            }
            if (test.steps.length) {
                m.steps = test.steps.map((s) => ({
                    Action: s.fields.Action || '',
                    Data: s.fields.Data || '',
                    'Expected Result': s.fields['Expected Result'] || '',
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
        fs.writeFileSync(jsonPath, jsonContent, 'utf8');
        if (!isQuiet()) {
            info('Mapeamento salvo: ' + path.basename(jsonPath));
        }
    }

    private _writeMdMapping(
        outDir: string,
        baseName: string,
        sourcePath: string,
        tests: TestCase[],
        tasksId: string[],
    ): void {
        const mdPath = path.join(outDir, baseName + '-jira-mapping.md');
        const mdContent = generatePreviewMarkdown(tests, {
            keys: tasksId,
            documentTitle: 'Jira Mapping: ' + baseName + path.extname(sourcePath),
            showTimestamp: true,
        });
        fs.writeFileSync(mdPath, mdContent, 'utf8');
        if (!isQuiet()) {
            info('Sumario salvo: ' + path.basename(mdPath));
        }
    }

    private _writeSummaryTxt(outDir: string, baseName: string, tasksId: string[], tests: TestCase[]): void {
        const txtPath = path.join(outDir, baseName + '-summary.txt');
        const txtContent =
            tasksId
                .map((key, i) => {
                    const test = (Reflect.get(tests, i) as TestCase | undefined) || emptyTestCase();
                    return key + ': ' + (test.title || '(untitled)');
                })
                .join('\n') + '\n';
        fs.writeFileSync(txtPath, txtContent, 'utf8');
    }
}

export default MappingFileGenerator;
