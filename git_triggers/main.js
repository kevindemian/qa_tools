const readlineSync = require('readline-sync');
const os = require('os');
const GitLabManager = require('./gitlab_manager'); // Import the GitLabManager class

// Load the dotenv package
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // Load the .env file from the parent directory

// Set your Git details
let gitlabApiToken = process.env.GIT_TOKEN;
let gitlabBaseUrl = process.env.GIT_BASE_URL;

// Log the variables to verify they are loaded
const mask = (v) => v ? v.slice(0, 4) + "****" : "";

if (process.env.DEBUG === 'true') {
	console.log('Git Base URL:', gitlabBaseUrl);
	console.log('Git Base URL:', mask(gitlabApiToken));
}

// Define your GitLab projects with their IDs
const projects = {
	'qa_ibabs': '47849962',
	'qa_ibabs_cast': '64210552',
	'qa_insiderlog': '39673943',
	'qa_policylog': '62454464',
	'qa_integritylog': '43908945',
	'qa_irmanager': '41268567',
	'qa_newslog': '62454464',
	'qa_tools': '62689551'
};

// Cesar // Antonio // Joao // Carlos // Lucas // Leonardo // Gonçalo // Tiago //G 25080915, T 25081138
let reviewers = [12161752, 14566471, 23136801, 23422965, 23515703, 24922000]

// Function to display the initial project selection menu
function displayProjectSelectionMenu() {
	console.log("\nSelect a GitLab Project:");
	Object.keys(projects).forEach((projectName, index) => {
		console.log(`${index + 1} - ${projectName}`);
	});
	console.log(`${Object.keys(projects).length + 1} - exit`);
}

// Function to display GitLab actions menu
function displayGitLabMenu(proj) {
	console.log("\nGitLab Project Trigger Menu for '" + proj + "':");
	console.log("1 - Trigger a new pipeline");
	console.log("2 - List pipeline schedules");
	console.log("3 - Trigger pipeline schedule");
	console.log("4 - Create a merge request");
	console.log("5 - List approved merge requests");
	console.log("6 - Merge by MR_id");
	console.log("7 - Level the Branches, main into rel_cand and rel_cand into dev");
	console.log("8 - Print project CI/CD variables (.env format)");
	console.log("9 - Switch project");
	console.log("0 - Exit\n");
}

// Main function
async function main() {
	if (os.platform() === 'win32') {
		console.clear();  // Clear the console on Windows
	}

	let selectedProject = null;
	let gitlabManager = null;

	while (true) {
		if (!selectedProject) {
			// If no project is selected, show the project selection menu
			displayProjectSelectionMenu();
			const projectChoice = readlineSync.question('Please select a project (1-X): ');

			const projectIndex = parseInt(projectChoice) - 1;
			if (projectIndex >= 0 && projectIndex < Object.keys(projects).length) {
				const projectName = Object.keys(projects)[projectIndex];
				const projectId = projects[projectName];

				// Initialize GitLabManager with the selected project ID
				gitlabManager = new GitLabManager(projectId, gitlabApiToken, gitlabBaseUrl);
				selectedProject = projectName;
				console.log(`Project selected: ${selectedProject}`);
			} else if (projectChoice === `${Object.keys(projects).length + 1}`) {
				console.log('Exiting program.');
				return;
			} else {
				console.log('Invalid selection. Please choose a valid project.');
			}
		} else {
			// Once a project is selected, display GitLab actions menu
			displayGitLabMenu(selectedProject);
			const choice = readlineSync.question('Please select an option (1-X): ');

			switch (choice) {
				case '1':
					// Trigger a pipeline
					const branch = readlineSync.question('\nEnter branch name to trigger pipeline: ').trim(); // Trim to avoid spaces
					console.log('Branch name provided:', branch + '\n'); // Log the branch name for debugging

					// Collect variables as an array of objects with key-value pairs
					const variables = [
						{
							key: 'PARALLEL_EXECUTION_DEV',
							value: readlineSync.question('PARALLEL_EXECUTION_DEV (true/false), default false: ', { defaultInput: 'false' }),
						},
						{
							key: 'RECORD_VIDEO',
							value: readlineSync.question('RECORD_VIDEO (true/false), default false: ', { defaultInput: 'false' }),
						},
						{
							key: 'SEND_EMAIL_DEV',
							value: readlineSync.question('SEND_EMAIL_DEV (true/false), default false: ', { defaultInput: 'false' }),
						},
						{
							key: 'NPM_SCRIPT',
							value: readlineSync.question('NPM_SCRIPT, default cy-all-dashboard: ', { defaultInput: 'cy-all-dashboard' }),
						}
					];

					// Check if NPM_SCRIPT is 'cy-run-specific-specs-dashboard-dev' or other
					if (variables.find(v => v.key === 'NPM_SCRIPT').value !== 'cy-all-dashboard') {
						let userInput = readlineSync.question('RUN_SPECIFIC_SPECS, no default: ');

						// Replace all backslashes with forward slashes
						userInput = userInput.replace(/\\/g, '/');

						variables.push({
							key: 'RUN_SPECIFIC_SPECS',
							value: userInput
						});
					}

					console.log('\nVariables:', variables); // Log the variables for debugging

					// Prepare the payload for triggering the pipeline
					const payload = {
						ref: branch,
						variables: variables
					};

					try {
						await gitlabManager.triggerPipeline(payload); // Pass the entire payload to the trigger function
					} catch (error) {
						console.error('Failed to trigger pipeline:', error.message);
					}
					break;

				case '2':
					// List available pipeline schedules
					try {
						const schedules = await gitlabManager.getPipelineSchedules();
						console.log('\nAvailable Pipeline Schedules:\n');

						schedules.forEach(schedule => {
							console.log(`ID: ${schedule.id}, Description: ${schedule.description}, Next Run: ${schedule.next_run_at}`);
						});
					} catch (error) {
						console.error('Error fetching pipeline schedules:', error.message);
					}
					break;

				case '3':
					// Trigger a pipeline schedule by ID
					const scheduleId = readlineSync.question('\nEnter the pipeline schedule ID: ');
					try {
						await gitlabManager.triggerPipelineSchedule(scheduleId);
					} catch (error) {
						console.error('Error triggering pipeline schedule:', error.message);
					}
					break;

				case '4':
					// Create a merge request
					const sourceBranch = readlineSync.question('\nEnter the source branch: ');
					const targetBranch = readlineSync.question('Enter the target branch: [default: dev]: ', { defaultInput: 'dev' });
					// Construct the default title
					const defaultTitle = `${sourceBranch} into ${targetBranch}`;

					// Prompt the user for the merge request title with the constructed default input
					const title = readlineSync.question(`Enter the merge request title: [default: ${defaultTitle}]: `, { defaultInput: defaultTitle });
					const description = readlineSync.question('Enter the merge request description (optional): ', { defaultInput: '' });
					const removeSourceBranch = true;

					// Send to review
					const alsoReview = readlineSync.question(`\nWith reviewers?  (y or n, defaultInput: y) `, { defaultInput: 'y' });

					try {

						if( alsoReview === 'n' ) {
							reviewers = []
						}

						const result_case4 = await gitlabManager.createMergeRequest(sourceBranch, targetBranch, title, {
							description: description,
							removeSourceBranch: removeSourceBranch,
							reviewer_ids: reviewers
						});

						console.log('Copy next message and Past into Teams:\n');
						console.log(selectedProject + ': ' + result_case4.title + ', ' + result_case4.web_url + '\n');

						if( alsoReview === 'n' ) {
							console.log("Wait 5 seconds to merge");
							await GitLabManager.delay(5000);
							await gitlabManager.mergeMergeRequest(result_case4.iid);
						}

					} catch (error) {
						console.error('Failed to create merge request:', error.message);
					}
					break;

				case '5':
					// List approved merge requests
					try {
						const approvedMergeRequests = await gitlabManager.getApprovedMergeRequests();
						if (approvedMergeRequests.length > 0) {
							console.log('\nApproved Merge Requests:\n');
							for (const aproved of approvedMergeRequests) {
								console.log('MR_id: ' + aproved.iid + ', MR_title: ' + aproved.title);
							}
						}
						else {
							console.log('\nNo Approved Merge Requests to list\n');
						}
					} catch (error) {
						console.error('Error fetching approved merge requests:', error.message);
					}
					break;

				case '6':
					// Merge by MR_id
					const mr_id = readlineSync.question('\nEnter the MR id: ').toString();;
					await gitlabManager.mergeMergeRequest(mr_id);
					break;

				case '7':
					//Level all branches
					main_branch = 'main';
					rel_cand_branch = 'rel_cand';
					dev_branch = 'dev';
					let title_leveling = `${main_branch} into ${rel_cand_branch}`;
					let title_leveling2 = `${rel_cand_branch} into ${dev_branch}`;
					let failed = false;

					try {
						// First MR and Merge
						const result1 = await gitlabManager.createMergeRequest(main_branch, rel_cand_branch, title_leveling, {
							removeSourceBranch: false
						});

						// Wait and check for mergeable status
						await GitLabManager.delay(10000); // Use GitLabManager.delay instead of gitlabManager.delay cause its static
						const canMerge = await gitlabManager.isMergeRequestMergeable(result1.iid);

						if (canMerge) {
							await gitlabManager.mergeMergeRequest(result1.iid);
						} else {
							console.log('Merge request not ready for merging.');
							failed = true;
						}
					} catch (error) {
						console.error('Failed to create or merge the first merge request:', error.response ? error.response.data : error.message);
						failed = true;
					}

					if (!failed) {
						try {
							// Second MR and Merge
							const result2 = await gitlabManager.createMergeRequest(rel_cand_branch, dev_branch, title_leveling2, {
								removeSourceBranch: false
							});

							await GitLabManager.delay(10000);
							const canMerge2 = await gitlabManager.isMergeRequestMergeable(result2.iid);
							if (canMerge2) {
								await gitlabManager.mergeMergeRequest(result2.iid);
								console.log(`\n${selectedProject}: All Branches are now leveled\n`);
							} else {
								console.log('Second merge request not ready for merging.');
							}
						} catch (error) {
							console.error('Failed to create or merge the second merge request:', error.response ? error.response.data : error.message);
						}
					}
					break;

				case '8':
					// Print project CI/CD variables (.env format)
					try {
						const envContent = await gitlabManager.getCICDVariablesAsEnv();
						console.log('\nProject CI/CD variables (.env format):\n');
						console.log(envContent);
						console.log('\nYou can copy this into a local .env file for testing.\n');
					} catch (error) {
						console.error('Failed to fetch CI/CD variables:', error.message);
					}
					break;

				case '9':
					// Switch project
					selectedProject = null;  // Reset project selection
					gitlabManager = null;  // Reset GitLabManager instance
					break;

				case '0':
					// Exit
					console.log('Exiting program.');
					return;

				default:
					console.log('Invalid option, please choose between 1-4.');
			}
		}
	}
}

main();
