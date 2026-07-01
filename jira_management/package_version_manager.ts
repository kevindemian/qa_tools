/** Manage project version and release notes: update `package.json` version and prepend release notes entries. */
import fs from 'fs';
import path from 'path';
import type { JsonObject } from '../shared/types.js';
import { rootLogger } from '../shared/logger.js';

/** Reads/writes `package.json` version and `release_notes/ReleaseNotes.txt`. */
class PackageVersionManager {
    packagePath: string;
    releaseNotesPath: string;

    constructor(projectDir: string) {
        this.packagePath = path.join(projectDir, 'package.json');
        this.releaseNotesPath = path.join(projectDir, 'release_notes', 'ReleaseNotes.txt');
    }

    updateVersion(newVersion: string): void {
        this._updateJsonFile(this.packagePath, newVersion);
    }

    _updateJsonFile(filePath: string, newVersion: string, extraUpdate?: (json: JsonObject) => void): void {
        try {
            const data = fs.readFileSync(path.resolve(filePath), 'utf8');
            const json: JsonObject = JSON.parse(data) as JsonObject;
            json['version'] = newVersion;
            if (extraUpdate) extraUpdate(json);
            fs.writeFileSync(path.resolve(filePath), JSON.stringify(json, null, 2), 'utf8');
            rootLogger.info(`Versão atualizada em ${path.basename(filePath)}: ${newVersion}`);
        } catch (err) {
            rootLogger.error(`Erro ao atualizar ${path.basename(filePath)}: ${(err as Error).message}`);
        }
    }

    updateReleaseNotes(versionNumber: string, tasks: unknown): void {
        if (!Array.isArray(tasks)) {
            rootLogger.error('updateReleaseNotes: tasks deve ser um array.');
            return;
        }

        if (!fs.existsSync(path.resolve(this.releaseNotesPath))) {
            rootLogger.error(`Arquivo de release notes não encontrado: ${this.releaseNotesPath}`);
            return;
        }

        try {
            const releaseNotesContent = fs.readFileSync(path.resolve(this.releaseNotesPath), 'utf8');
            const lines = releaseNotesContent.split('\n');
            const releaseNotesHeader = lines.slice(0, 2).join('\n');
            const oldReleaseNotes = lines.slice(2).join('\n');

            let newReleaseNotes =
                '-------------------------------------------------------------------------------------------------------------------\n';
            newReleaseNotes += `Release ${versionNumber}:\n\n`;

            tasks.forEach((task) => {
                if (typeof task === 'string') {
                    newReleaseNotes += `${task}\n`;
                }
            });

            const updatedReleaseNotes = `${releaseNotesHeader}\n\n${newReleaseNotes}${oldReleaseNotes}\n`;
            fs.writeFileSync(path.resolve(this.releaseNotesPath), updatedReleaseNotes, 'utf8');
            rootLogger.info(`Release notes atualizadas com versão ${versionNumber}.`);
        } catch (error) {
            rootLogger.error(`Erro ao atualizar release notes: ${(error as Error).message}`);
        }
    }
}

export default PackageVersionManager;
