/** Generate mapping JSON files that link test titles to Jira issue keys after import. */
import { formatErr } from '../shared/errors.js';
import fs from 'fs';
import path from 'path';
import { rootLogger } from '../shared/logger.js';
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
            const resolvedDir = path.resolve(outDir);
            const normalizedBase = path.resolve(outDir);
            if (!resolvedDir.startsWith(normalizedBase + path.sep) && resolvedDir !== normalizedBase) {
                rootLogger.warn('MappingFileGenerator: path traversal blocked for output dir');
                return;
            }
            if (!fs.existsSync(resolvedDir)) {
                fs.mkdirSync(resolvedDir, { recursive: true });
            }
        } catch (err: unknown) {
            rootLogger.warn('Não foi possível criar diretório de saida: ' + outDir + ' — ' + formatErr(err));
            return;
        }

        const createdTests = tests.slice(0, tasksId.length);
        const mappings = this._buildMappings(tasksId, createdTests);

        this._writeJsonMapping(outDir, baseName, sourcePath, projectName, mappings);
        this._writeMdMapping(outDir, baseName, sourcePath, createdTests, tasksId);
        this._writeSummaryTxt(outDir, baseName, tasksId, createdTests);
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
        const resolvedJsonPath = path.resolve(jsonPath);
        const normalizedBase = path.resolve(outDir);
        if (!resolvedJsonPath.startsWith(normalizedBase + path.sep) && resolvedJsonPath !== normalizedBase) {
            rootLogger.warn('MappingFileGenerator: path traversal blocked for JSON');
            return;
        }
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
        fs.writeFileSync(resolvedJsonPath, jsonContent, 'utf8');
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
        const resolvedMdPath = path.resolve(mdPath);
        const normalizedBase = path.resolve(outDir);
        if (!resolvedMdPath.startsWith(normalizedBase + path.sep) && resolvedMdPath !== normalizedBase) {
            rootLogger.warn('MappingFileGenerator: path traversal blocked for MD');
            return;
        }
        const mdContent = generatePreviewMarkdown(tests, {
            keys: tasksId,
            documentTitle: 'Jira Mapping: ' + baseName + path.extname(sourcePath),
            showTimestamp: true,
        });
        fs.writeFileSync(resolvedMdPath, mdContent, 'utf8');
        if (!isQuiet()) {
            info('Sumario salvo: ' + path.basename(mdPath));
        }
    }

    private _writeSummaryTxt(outDir: string, baseName: string, tasksId: string[], tests: TestCase[]): void {
        const txtPath = path.join(outDir, baseName + '-summary.txt');
        const resolvedTxtPath = path.resolve(txtPath);
        const normalizedBase = path.resolve(outDir);
        if (!resolvedTxtPath.startsWith(normalizedBase + path.sep) && resolvedTxtPath !== normalizedBase) {
            rootLogger.warn('MappingFileGenerator: path traversal blocked for TXT');
            return;
        }
        const txtContent =
            tasksId
                .map((key, i) => {
                    const test = (Reflect.get(tests, i) as TestCase | undefined) || emptyTestCase();
                    return key + ': ' + (test.title || '(untitled)');
                })
                .join('\n') + '\n';
        fs.writeFileSync(resolvedTxtPath, txtContent, 'utf8');
    }
}

export default MappingFileGenerator;
