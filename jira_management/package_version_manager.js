const fs = require('fs');
const path = require('path');

class PackageVersionManager {
    constructor(projectDir) {
        // Use projectDir for dynamic path initialization
        this.packagePath = path.join(projectDir, 'package.json');
        this.packageLockPath = path.join(projectDir, 'package-lock.json');
        this.releaseNotesPath = path.join(projectDir, 'release_notes', 'ReleaseNotes.txt');
    }

    // Function to update version in both package.json and package-lock.json
    updateVersion(newVersion) {
        // Read and update package.json
        this.updatePackageJsonVersion(newVersion);

        // Read and update package-lock.json
        this.updatePackageLockVersion(newVersion);
    }

    // Helper function to update package.json
    updatePackageJsonVersion(newVersion) {
        try {
            const packageData = fs.readFileSync(this.packagePath, 'utf8');
            const packageJson = JSON.parse(packageData);
            console.log(`Old version in package.json: ${packageJson.version}`);

            // Update version in package.json
            packageJson.version = newVersion;

            // Write the updated package.json back
            fs.writeFileSync(this.packagePath, JSON.stringify(packageJson, null, 2), 'utf8');
            console.log(`Updated version in package.json: ${newVersion}`);
        } catch (err) {
            console.error('Error updating package.json:', err.message);
        }
    }

    // Helper function to update package-lock.json
    updatePackageLockVersion(newVersion) {
        try {
            const packageLockData = fs.readFileSync(this.packageLockPath, 'utf8');
            const packageLockJson = JSON.parse(packageLockData);
            console.log(`Old version in package-lock.json: ${packageLockJson.version}`);

            // Update the root version in package-lock.json
            packageLockJson.version = newVersion;

            // Update the version inside the "packages" section if it exists
            if (packageLockJson.packages && packageLockJson.packages['']) {
                packageLockJson.packages[''].version = newVersion;
            }

            // Write the updated package-lock.json back
            fs.writeFileSync(this.packageLockPath, JSON.stringify(packageLockJson, null, 2), 'utf8');
            console.log(`Updated version in package-lock.json: ${newVersion}`);
        } catch (err) {
            console.error('Error updating package-lock.json:', err.message);
        }
    }

    // Function to update ReleaseNotes.txt
	updateReleaseNotes(versionNumber, tasks) {
		try {
			// Read the existing release notes
			const releaseNotesContent = fs.readFileSync(this.releaseNotesPath, 'utf8');
			const lines = releaseNotesContent.split('\n');

			// Skip the first two lines (Application info)
			const releaseNotesHeader = lines.slice(0, 2).join('\n');  // Keep the header intact
			const oldReleaseNotes = lines.slice(2).join('\n');  // Keep old release notes intact

			// Format new release notes
			let newReleaseNotes = "-------------------------------------------------------------------------------------------------------------------\n";
			newReleaseNotes += `Release ${versionNumber}:\n\n`;

			// Debugging: Print the tasks to check their structure
			console.log("Tasks to be added:");
			tasks.forEach(task => console.log(task));

			// Ensure tasks are treated correctly as a list of strings and append to newReleaseNotes
			tasks.forEach(task => {
				if (typeof task === 'string') {
					newReleaseNotes += `${task}\n`;  // Append each task with a newline
				}
			});

			// Combine everything into a single content string
			// Add the new release notes immediately after the header, then append old release notes
			const updatedReleaseNotes = `${releaseNotesHeader}\n\n${newReleaseNotes}${oldReleaseNotes}\n`;

			// Write the updated release notes back to the file
			fs.writeFileSync(this.releaseNotesPath, updatedReleaseNotes, 'utf8');

			console.log(`Release notes updated with version ${versionNumber}.`);

		} catch (error) {
			console.error(`Error updating release notes: ${error.message}`);
		}
	}

}

module.exports = PackageVersionManager;
