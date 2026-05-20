// @ts-check
const fs = require('fs');
const path = require('path');
const { rootLogger } = require('../shared/logger');

class PackageVersionManager {
    /** @param {string} projectDir */
    constructor(projectDir) {
        this.packagePath = path.join(projectDir, 'package.json');
        this.releaseNotesPath = path.join(projectDir, 'release_notes', 'ReleaseNotes.txt');
    }

    updateVersion(newVersion) {
        this._updateJsonFile(this.packagePath, newVersion);
    }

    _updateJsonFile(filePath, newVersion, extraUpdate) {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            const json = JSON.parse(data);
            json.version = newVersion;
            if (extraUpdate) extraUpdate(json);
            fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf8');
            rootLogger.info(`Versao atualizada em ${path.basename(filePath)}: ${newVersion}`);
        } catch (err) {
            rootLogger.error(`Erro ao atualizar ${path.basename(filePath)}: ${err.message}`);
        }
    }

    updateReleaseNotes(versionNumber, tasks) {
        if (!Array.isArray(tasks)) {
            rootLogger.error('updateReleaseNotes: tasks deve ser um array.');
            return;
        }

        if (!fs.existsSync(this.releaseNotesPath)) {
            rootLogger.error(`Arquivo de release notes nao encontrado: ${this.releaseNotesPath}`);
            return;
        }

        try {
            const releaseNotesContent = fs.readFileSync(this.releaseNotesPath, 'utf8');
            const lines = releaseNotesContent.split('\n');
            const releaseNotesHeader = lines.slice(0, 2).join('\n');
            const oldReleaseNotes = lines.slice(2).join('\n');

            let newReleaseNotes = "-------------------------------------------------------------------------------------------------------------------\n";
            newReleaseNotes += `Release ${versionNumber}:\n\n`;

            tasks.forEach(task => {
                if (typeof task === 'string') {
                    newReleaseNotes += `${task}\n`;
                }
            });

            const updatedReleaseNotes = `${releaseNotesHeader}\n\n${newReleaseNotes}${oldReleaseNotes}\n`;
            fs.writeFileSync(this.releaseNotesPath, updatedReleaseNotes, 'utf8');
            rootLogger.info(`Release notes atualizadas com versao ${versionNumber}.`);

        } catch (error) {
            rootLogger.error(`Erro ao atualizar release notes: ${error.message}`);
        }
    }
}

module.exports = PackageVersionManager;
