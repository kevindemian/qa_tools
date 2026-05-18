const axios = require('axios');
const https = require('https');

class JiraResource {
    constructor(personalToken, baseUrl) {
        this.baseUrl = baseUrl;
        this.headers = {
            'Authorization': `Bearer ${personalToken}`,
            'Content-Type': 'application/json',
        };
        this.axiosInstance = axios.create({
            baseURL: baseUrl,
            headers: this.headers,
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            })
        });
    }

    // Method to add a delay
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }


    // Function to GET Jira Resource
    async getJiraResource(resourceUrl) {
        try {
            const response = await this.axiosInstance.get(`/${resourceUrl}`);
            return response.data;
        } catch (error) {
            console.error('getJiraResource - HTTP error occurred:', error.response ? error.response.data : error.message);
        }
    }

    // Function to POST Jira Resource (create issues, etc.)
    async postJiraResource(resourceUrl, data, maxRetries = 10) {
        let attempt = 0;

        while (attempt < maxRetries) {
            try {
                const response = await this.axiosInstance.post(`/${resourceUrl}`, data);
                return response.data;
            } catch (err) {
                const status = err.response?.status;
                const message = err.message || err.response?.data?.message || '';

                const isRateLimit =
                    status === 429 ||
                    message.toLowerCase().includes('rate limit') ||
                    message.toLowerCase().includes('too many requests') ||
                    message.toLowerCase().includes('econnreset');

                if (isRateLimit) {
                    const waitTime = 2000 * (attempt + 1);
                    console.warn(`postJiraResource - Rate limit detected (attempt ${attempt + 1}). Waiting ${waitTime}ms...`);
                    await JiraResource.delay(waitTime);
                    attempt++;
                    continue;
                }

                // Not a rate limit → real error
                console.error(`postJiraResource - HTTP error occurred:`, err.response ? err.response.data : err.message);
                throw err;
            }
        }

        throw new Error(`postJiraResource - Failed to post to ${resourceUrl} after ${maxRetries} retries due to rate limits.`);
    }

    // Function to PUT Jira Resource (edit issues, etc.)
    async putJiraResource(resourceUrl, data) {
        try {
            const response = await this.axiosInstance.put(`/${resourceUrl}`, data);
            return response.status === 204 ? null : response.data;
        } catch (error) {
            console.error('putJiraResource - HTTP error occurred:', error.response ? error.response.data : error.message);
        }
    }

    // Get project id by name
    async getProjectId(projectName) {
        const projectData = await this.getJiraResource(`project/${projectName}`);
        return projectData ? projectData.id : null;
    }

    // Get versions of a project
    async getProjectVersions(projectId) {
        return await this.getJiraResource(`project/${projectId}/versions`);
    }

    // Get version id by version name for a project
    async getVersionId(projectName, versionName) {
        const projectId = await this.getProjectId(projectName);
        const versions = await this.getProjectVersions(projectId);

        const version = versions.find(v => v.name.toLowerCase() === versionName.toLowerCase());
        if (version) {
            return version.id;
        } else {
            console.log(`Version '${versionName}' not found in project '${projectName}'.`);
            return null;
        }
    }

    // Function to create a version
    async createVersion(projectName, versionName, description) {
        const versionId = await this.getVersionId(projectName, versionName);
        if (versionId) {
            console.log(`Version '${versionName}' already exists.`);
            return null;
        }

        const payload = {
            description,
            name: versionName,
            project: projectName,
            released: false
        };

        console.log(`Creating version with payload: ${JSON.stringify(payload)}`);
        const response = await this.postJiraResource('version', payload);

        if (response) {
            console.log('Version created successfully:', response);
        } else {
            console.log('Failed to create version.');
        }
    }

    // Function to check if all tasks in a version are 'Done' or 'IN USE'
    async checkReleaseTasksStatus(projectName, versionName) {
        const projectId = await this.getProjectId(projectName);
        const jql = `project = ${projectId} AND fixVersion = "${versionName}"`;

        const issuesData = await this.getJiraResource(`search?jql=${encodeURIComponent(jql)}`);
        if (!issuesData || !issuesData.issues || issuesData.issues.length === 0) {
            console.log(`No issues found for version '${versionName}' in project '${projectName}'.`);
            return false;
        }

        let allTasksCompleted = true;
        for (const issue of issuesData.issues) {
            const status = issue.fields.status.name;
            if (!['done', 'in use'].includes(status.toLowerCase())) {
                console.log(` - Issue '${issue.key}' is NOT completed. Status: ${status}`);
                allTasksCompleted = false;
            } else {
                console.log(` - Issue '${issue.key}' is completed (Status: ${status}).`);
            }
        }

        return allTasksCompleted;
    }

    // Method to get release tasks for a given project and version
    async getReleaseTasks(projectName, versionName, typeTestOnly=false) {
        const projectId = await this.getProjectId(projectName);

        let jql = ''

        if ( typeTestOnly ) {
            jql = `project = ${projectId} AND fixVersion = "${versionName}" AND type = "Test"`;
        }
        else {
            jql = `project = ${projectId} AND fixVersion = "${versionName}"`;
        }

        const issuesData = await this.getJiraResource(`search?jql=${encodeURIComponent(jql)}`);
        if (!issuesData || !issuesData.issues || issuesData.issues.length === 0) {
            console.log(`No issues found for version '${versionName}' in project '${projectName}'.`);
            return false;
        }

        // Initialize the releaseTasks array
        const releaseTasks = [];

        // Loop through all issues and add to the releaseTasks array
        issuesData.issues.forEach(issue => {
            const taskString = `[${issue.key}] - ${issue.fields.summary}`;
            releaseTasks.push(taskString);
        });

        // Return the list of tasks
        return releaseTasks;
    }

    // Function to get the latest X releases
    async getLatestReleases(projectName, numReleases) {
        const projectId = await this.getProjectId(projectName);
        const allVersions = await this.getProjectVersions(projectId);

        // Filter and sort released versions
        const releasedVersions = allVersions
            .filter(v => v.released && v.releaseDate)
            .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));

        // Get the latest X released versions
        const latestReleasedVersions = releasedVersions.slice(0, numReleases);

        // Filter unreleased versions
        const unreleasedVersions = allVersions.filter(v => !v.released);

        // Print formatted released versions
        console.log(`Latest ${latestReleasedVersions.length} released versions for project '${projectName}':`);
        latestReleasedVersions.forEach(v => {
            console.log(`Version: ${v.name} (Release Date: ${v.releaseDate})`);
        });

        // Print formatted unreleased versions
        console.log("\nUnreleased versions for project '" + projectName + "':");
        if (unreleasedVersions.length > 0) {
            unreleasedVersions.forEach(v => {
                const description = v.description || 'No description';
                console.log(`Version: ${v.name} (Description: ${description})`);
            });
        } else {
            console.log("No unreleased versions found.");
        }

        return { latestReleasedVersions, unreleasedVersions };
    }

    // Function to add a list of tasks to a sprint, supports sprint name or numeric ID
    async addTasksToSprint(taskIds, sprintId) {

        const payload = {
            issues: taskIds
        };

        try {
            console.log(`\nAssigning tasks to sprint ${sprintId}:`, taskIds);
            await this.postJiraResource(`sprint/${sprintId}/issue`, payload);
            console.log('Tasks successfully added to the sprint.');
        } catch (error) {
            console.error(`addTasksToSprint - Failed to assign tasks to sprint ${sprintId}`, error.response?.data || error);
        }
    }

    // Function to insert a list of tasks in a sprint
    async updateFixVersions(taskIds, projectName, versionName) {
        const versionId = await this.getVersionId(projectName, versionName);
        if (!versionId) {
            console.log(`Version '${versionName}' not found in project '${projectName}'.`);
            return;
        }

        const payload = {
            update: {
                fixVersions: [
                    { set: [{ id: versionId }] }
                ]
            }
        };

        for (const taskId of taskIds) {
            console.log(`Updating task: ${taskId}`);
            await this.putJiraResource(`issue/${taskId}`, payload);
        }
    }

    // Function to release a version
    async releaseVersion(projectName, versionName) {
        const versionId = await this.getVersionId(projectName, versionName);
        if (!versionId) {
            console.log(`Version '${versionName}' not found, cannot release.`);
            return;
        }

        const allTasksCompleted = await this.checkReleaseTasksStatus(projectName, versionName);
        if (!allTasksCompleted) {
            console.log(`Cannot release version '${versionName}' as not all tasks are completed.`);
            return;
        }

        const releaseDate = new Date().toISOString().split('T')[0]; // Format as 'YYYY-MM-DD'
        const payload = { releaseDate, released: true };

        console.log(`Releasing version '${versionName}' with payload: ${JSON.stringify(payload)}`);
        await this.putJiraResource(`version/${versionId}`, payload);
    }

    // Function to move tasks to "Done"
    async moveCardsToDone(taskIds) {
        for (const taskId of taskIds) {
            // Fetch issue details to get the current status
            const issueData = await this.getJiraResource(`issue/${taskId}`);
            if (!issueData || !issueData.fields || !issueData.fields.status) {
                console.log(`Skipping task ${taskId}: Unable to retrieve status.`);
                continue;
            }

            const currentStatus = issueData.fields.status.name.toLowerCase();
            console.log(`Task ${taskId} current status: ${currentStatus}`);

            // Move card based on its current status
            switch (currentStatus) {
				case 'coding in progress':
                    console.log(` - Moving task ${taskId} from In Progress to Review`);
                    await this.transitionIssue(taskId, 61); // Move to "Coding Done"
                    console.log(` - Moving task ${taskId} from Review to Done`);
                    await this.transitionIssue(taskId, 141); // Move to "Done"
                    break;

                case 'coding done':
                    console.log(` - Moving task ${taskId} from Review to Done`);
                    await this.transitionIssue(taskId, 141); // Move to "Done"
                    break;

                // case 3 and 4 are specific for Test type tasks
                case 'new':
                    console.log(` - Moving task ${taskId} from New to Approve`);
                    await this.transitionIssue(taskId, 21); // Move to "Approve"
                    console.log(` - Moving task ${taskId} from Approve to Use test case`);
                    await this.transitionIssue(taskId, 41); // Move to "Use test case"
                    break;

                case 'approve':
                    console.log(` - Moving task ${taskId} from Approve to Use test case`);
                    await this.transitionIssue(taskId, 41); // Move to "Use test case"
                    break;

                default:
                    console.log(`Task ${taskId} is not in a movable state.`);
            }

        }
    }

    // Helper function to transition an issue
    async transitionIssue(issueId, transitionId) {
        const payload = { transition: { id: transitionId } };
        console.log(`    - Moving ${issueId} with transition ${transitionId}...`);

        try {
            await this.postJiraResource(`issue/${issueId}/transitions`, payload);
            console.log(` - Task ${issueId} moved successfully.`);
        } catch (error) {
            console.error(`transitionIssue - Failed to move task ${issueId}:`, error.response ? error.response.data : error.message);
        }
    }
}

module.exports = JiraResource;
