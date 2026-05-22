import fs from 'fs';
import path from 'path';
import { rootLogger } from '../shared/logger';

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

  _updateJsonFile(filePath: string, newVersion: string, extraUpdate?: (json: Record<string, unknown>) => void): void {
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      const json = JSON.parse(data);
      json.version = newVersion;
      if (extraUpdate) extraUpdate(json);
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf8');
      rootLogger.info(`Versão atualizada em ${path.basename(filePath)}: ${newVersion}`);
    } catch (err) {
      rootLogger.error(`Erro ao atualizar ${path.basename(filePath)}: ${(err as Error).message}`);
    }
  }

  updateReleaseNotes(versionNumber: string, tasks: string[]): void {
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

      let newReleaseNotes = '-------------------------------------------------------------------------------------------------------------------\n';
      newReleaseNotes += `Release ${versionNumber}:\n\n`;

      tasks.forEach(task => {
        if (typeof task === 'string') {
          newReleaseNotes += `${task}\n`;
        }
      });

      const updatedReleaseNotes = `${releaseNotesHeader}\n\n${newReleaseNotes}${oldReleaseNotes}\n`;
      fs.writeFileSync(this.releaseNotesPath, updatedReleaseNotes, 'utf8');
      rootLogger.info(`Release notes atualizadas com versão ${versionNumber}.`);
    } catch (error) {
      rootLogger.error(`Erro ao atualizar release notes: ${(error as Error).message}`);
    }
  }
}

export = PackageVersionManager;
