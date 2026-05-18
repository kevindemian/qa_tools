const axios = require('axios');
const https = require('https');

class GitLabManager {
    constructor(projectId, apiToken, gitlabBaseUrl) {
        this.projectId = projectId;
        this.apiToken = apiToken;
        this.gitlabBaseUrl = gitlabBaseUrl; // Default to your GitLab instance
        this.apiUrl = `${this.gitlabBaseUrl}/api/v4/projects/${this.projectId}`;

		// Create an HTTPS agent to disable SSL certificate verification
        this.agent = new https.Agent({
            rejectUnauthorized: false // Disable certificate verification for this agent
        });
    }

    // Function to trigger a pipeline with specific parameters
    async triggerPipeline(payload) {
		const url = `${this.apiUrl}/pipeline`; // Use the trigger endpoint

		// Debugging: log the payload for debugging
		console.log('Payload:', payload); // Log the constructed payload for debugging

		try {
			// Sending a POST request to trigger the pipeline with the payload in the request body
			const response = await axios.post(url, payload, {
				headers: {
					'PRIVATE-TOKEN': this.apiToken, // Use API token for authentication
					'Content-Type': 'application/json' // Set the content type to JSON
				},
                httpsAgent: this.agent
			});

			console.log('Pipeline triggered successfully:', response.data);
			return response.data; // Return pipeline data
		} catch (error) {
			console.error('Error triggering pipeline:', error.response ? error.response.data : error.message);
			throw error;
		}
	}

	// List all pipeline schedules for the project
    async getPipelineSchedules() {
        const url = `${this.apiUrl}/pipeline_schedules`;

        try {
            const response = await axios.get(url, {
                headers: { 'PRIVATE-TOKEN': this.apiToken },
                httpsAgent: this.agent
            });

            console.log('Pipeline schedules retrieved successfully:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error fetching pipeline schedules:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    // Trigger a specific pipeline schedule by its ID
    async triggerPipelineSchedule(scheduleId) {
        const url = `${this.apiUrl}/pipeline_schedules/${scheduleId}/play`;

        try {
            const response = await axios.post(url, {}, {
                headers: { 'PRIVATE-TOKEN': this.apiToken },
                httpsAgent: this.agent
            });

            console.log('Pipeline schedule triggered successfully:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error triggering pipeline schedule:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

    // Function to create a merge request
	async createMergeRequest(sourceBranch, targetBranch, title, options = {}) {
		const url = `${this.apiUrl}/merge_requests`;

		try {
			const assigneeId = await this.getUserId();

			const response = await axios.post(url, {
				source_branch: sourceBranch,
				target_branch: targetBranch,
				title: title,
				description: options.description || '',
				remove_source_branch: options.removeSourceBranch,
				assignee_id: assigneeId,  // Set yourself as the assignee
				reviewer_ids: options.reviewer_ids  // Set the reviewers
			}, {
				headers: {
					'PRIVATE-TOKEN': this.apiToken
				},
                httpsAgent: this.agent
			});

			console.log('\nMerge request "'+title+'" created successfully, mr id: ', response.data.iid);
			return response.data; // Return merge request data
		} catch (error) {
			// Handle conflict error (409)
			if (error.response && error.response.status === 409) {
				console.log('Merge request already exists. Attempting to update it.');

				// Extract the merge request ID from the error message
				const existingMergeRequestId = error.response.data.message[0].match(/!(\d+)/)[1];

				// Call the update function to modify the existing MR
				return await this.updateMergeRequest(existingMergeRequestId, {
					title: title,
					description: options.description,
					remove_source_branch: options.removeSourceBranch,
					reviewer_ids: options.reviewer_ids
				});
			} else {
				console.error('Error creating merge request:', error.response ? error.response.data : error.message);
				throw error;
			}
		}
	}

	// Function to update an existing merge request
	async updateMergeRequest(mergeRequestId, options = {}) {
		const url = `${this.apiUrl}/merge_requests/${mergeRequestId}`;

		try {
			const response = await axios.put(url, {
				title: options.title,
				description: options.description || '',
				remove_source_branch: options.remove_source_branch,
				reviewer_ids: options.reviewer_ids
			}, {
				headers: {
					'PRIVATE-TOKEN': this.apiToken
				},
                httpsAgent: this.agent
			});

			console.log('Merge request updated successfully:', response.data);
			return response.data;

		} catch (error) {
			console.error('Error updating merge request:', error.response ? error.response.data : error.message);
			throw error;
		}
	}

	// Function to get your user ID
    async getUserId() {
        try {
            const response = await axios.get(`${this.gitlabBaseUrl}/api/v4/user`, {
                headers: { 'PRIVATE-TOKEN': this.apiToken },
                httpsAgent: this.agent
            });
            return response.data.id;  // Get your user ID
        } catch (error) {
            console.error('Error fetching user ID:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

	// Get all open Merge Requests and return those with 2 or more approvals
    async getApprovedMergeRequests() {
		const url = `${this.apiUrl}/merge_requests?state=opened`;

		try {
			const response = await axios.get(url, {
				headers: { 'PRIVATE-TOKEN': this.apiToken },
                httpsAgent: this.agent
			});

			const mergeRequests = response.data;
			const approvedMergeRequests = [];

			for (const mr of mergeRequests) {
				const approvalsUrl = `${this.apiUrl}/merge_requests/${mr.iid}/approvals`;
				const approvalsResponse = await axios.get(approvalsUrl, {
					headers: { 'PRIVATE-TOKEN': this.apiToken },
                httpsAgent: this.agent
				});

				const approvalsReceived = approvalsResponse.data.approved_by.length; // Total approvals received
				const requiredApprovals = approvalsResponse.data.approvals_required; // How many approvals are needed

				// Check if the merge request has received at least 2 approvals
				if (approvalsReceived >= 2) {
					approvedMergeRequests.push(mr);
				}
			}

			return approvedMergeRequests;
		} catch (error) {
			console.error('Error fetching merge requests:', error.response ? error.response.data : error.message);
			throw error;
		}
	}

	// Merge a Merge Request
	async mergeMergeRequest(mergeRequestId) {
        const url = `${this.apiUrl}/merge_requests/${mergeRequestId}/merge`;

		console.log('\nTrying to Merge, MR_ID: ', mergeRequestId);

        try {
            const response = await axios.put(url, {}, {
                headers: { 'PRIVATE-TOKEN': this.apiToken },
                httpsAgent: this.agent
            });

            console.log('\nMerge request merged successfully, state: ', response.data.state);
            return response.data;
        } catch (error) {
            console.error('Error merging merge request:', error.response ? error.response.data : error.message);
            throw error;
        }
    }

	// Method to add a delay
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Method to check if a merge request is mergeable
    async isMergeRequestMergeable(mergeRequestId) {
        const mrStatusUrl = `${this.apiUrl}/merge_requests/${mergeRequestId}`;
        try {
            const response = await axios.get(mrStatusUrl, {
                headers: { 'PRIVATE-TOKEN': this.apiToken },
                httpsAgent: this.agent
            });
            return response.data.merge_status === 'can_be_merged';
        } catch (error) {
            console.error('Error checking merge request status:', error.response ? error.response.data : error.message);
            return false;
        }
    }

	// Get all project-level CI/CD variables and return as key=value strings
	async getCICDVariablesAsEnv() {
		const url = `${this.apiUrl}/variables?per_page=100`;
		try {
			const response = await axios.get(url, {
				headers: { 'PRIVATE-TOKEN': this.apiToken },
				httpsAgent: this.agent
			});

			// Convert each variable to key=value format
			const envLines = response.data.map(v => `${v.key}=${v.value}`);
			return envLines.join('\n');
		} catch (error) {
			console.error('Error fetching CI/CD variables:', error.response ? error.response.data : error.message);
			throw error;
		}
	}

}

module.exports = GitLabManager;
