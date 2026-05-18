const readlineSync = require('readline-sync');
const JiraResource = require('./jira_resource'); // Import JiraResource class
const CsvResource = require('./csv_resource'); // Import CsvResource class
const os = require('os');
const PackageVersionManager = require('./package_version_manager');
const shell = require('shelljs');

// Load the dotenv package
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') }); // Load the .env file from the parent directory

// Set your Jira details
let base_url = process.env.JIRA_BASE_URL;
let personal_token = process.env.JIRA_PERSONAL_TOKEN;
let xray_url = process.env.XRAY_BASE_URL;
let default_project = 'ECSPOL';
let git_directory = 'no_dir_selected';
let csvDefaultPath = process.env.CSV_DEFAULT_PATH;

// Log the variables to verify they are loaded
const mask = (v) => v ? v.slice(0, 4) + "****" : "";

if (process.env.DEBUG === 'true') {
    console.log('Jira Base URL:', base_url);
    console.log('Jira Token:', mask(personal_token));
}

// Display menu options
function displayMenu(proj, git_directory) {
    console.log("\nJira Release Management Menu for "+proj+":");
    console.log("1 - Create a test with test steps (from csv), single or bulk");
    console.log("2 - List existing release versions");
    console.log("3 - Create a new release version");
    console.log("4 - Insert fixversion on tasks");
    console.log("5 - Update package versions and Release notes");
    console.log("6 - Check release tasks status");
    console.log("7 - Auto Close tasks");
    console.log("8 - Release a version");
    console.log("9 - Change Jira project name");
    console.log("10 - Change Git project directory (current: "+git_directory+")");
    console.log("0 - Exit\n");
}

// Main function
async function main() {
    if (os.platform() === 'win32') {
        console.clear();  // Clears the console on Windows
    }

    // Create instances
    const jiraResource = new JiraResource(personal_token, base_url+'/rest/api/2');
    const jiraResourceXray = new JiraResource(personal_token, xray_url);
    const csvResource = new CsvResource();
    let packageManager;
    let inMemoryTasksId = [];
    let inMemoryTasksText = [];

    // Ask for project name once at the start
    let project_name = readlineSync.question(`\nInsert project name [default: ${default_project}]: `, {defaultInput: default_project}).toUpperCase();

    while (true) {
        displayMenu(project_name, git_directory);
        const choice = readlineSync.question('Please select an option (1-X): ');

        switch (choice) {
            case '1':
                const csvPath = readlineSync.question(`\nInsert CSV file path [default: ${csvDefaultPath}]: `, { defaultInput: csvDefaultPath });
                let jiraLabelsInput = readlineSync.question(`\nInsert jira labels (Split by commas ","; empty to null): `);
                let jiraLabels = jiraLabelsInput
                                .split(',')
                                .map(l => l.trim())
                                .filter(l => l.length > 0);
                const alsoCreateStory = readlineSync.question(`\nAlso create a tech story and link them?  (y or n, defaultInput: n) `, { defaultInput: 'n' });

                console.log(`Reading CSV from: ${csvPath}`);

                try {
                    const tests = await csvResource.readBulkCsv(csvPath);

                    for (let t = 0; t < tests.length; t++) {
                        const test = tests[t];
                        const testTitle = test.title;
                        const validSteps = test.steps;

                        console.log(`\n[${t + 1}/${tests.length}] Creating test: ${testTitle}`);

                        inMemoryTasksText.push(testTitle);

                        const testData = {
                            fields: {
                                project: { key: project_name },
                                summary: testTitle,
                                description: "",
                                issuetype: { name: "Test" }
                            }
                        };

                        if (jiraLabels.length > 0) {
                            testData.fields.labels = jiraLabels;
                        }

                        const createdTestIssue = await jiraResource.postJiraResource('issue', testData);
                        console.log(`Test issue created with ID: ${createdTestIssue.key}`);
                        inMemoryTasksId.push(`${createdTestIssue.key}`);

                        // Step insertion
                        for (let i = 0; i < validSteps.length; i++) {
                            const step = validSteps[i];
                            const stepUrl = `test/${createdTestIssue.key}/steps`;

                            console.log(`Step: ${i + 1} started`);

                            try {
                                const start = Date.now();

                                await jiraResourceXray.postJiraResource(stepUrl, step);

                                const duration = Date.now() - start;

                                console.log(`   Test step added: ${step.fields.Action} (took ${duration}ms)`);
                                console.log(`Step: ${i + 1} ended`);

                            } catch (err) {
                                console.error(`   Failed to post step '${step.fields.Action}':`, err.message);
                            }
                        }

                        let testUrl = `https://jira.euronext.com/browse/${createdTestIssue.key}`;
                        shell.exec(`start ${testUrl}`);

                        // Story creation and linking
                        if (alsoCreateStory === 'y') {

                            const storyData = {
                                fields: {
                                    project: { key: project_name },
                                    summary: testTitle,
                                    description: "",
                                    issuetype: { name: "Tech Story" }
                                }
                            };

                            if (jiraLabels.length > 0) {
                                storyData.fields.labels = jiraLabels;
                            }

                            console.log(`Starting the creation of the Tech Story to link:`);

                            const createdStoryIssue = await jiraResource.postJiraResource('issue', storyData);

                            console.log(`   Tech story issue created with ID: ${createdStoryIssue.key}`);

                            inMemoryTasksId.push(`${createdStoryIssue.key}`);
                            inMemoryTasksText.push(testTitle);

                            let storyUrl = `https://jira.euronext.com/browse/${createdStoryIssue.key}`;

                            const linkIssuesData = {
                                type: { id: "11701" },
                                inwardIssue: { key: createdStoryIssue.key },
                                outwardIssue: { key: createdTestIssue.key }
                            };

                            console.log(`Start linking the stories:`);

                            await jiraResource.postJiraResource('issueLink', linkIssuesData);

                            console.log(`   Stories linked`);

                            shell.exec(`start ${storyUrl}`);
                        }
                    }

                } catch (error) {
                    console.error("switch case '1' - Error reading CSV:", error.message);
                }
                break;

            case '2':
                // List release versions
                const how_many = readlineSync.question('\nInsert the number of releases to retrieve: ');
                try {
                    const num_releases = parseInt(how_many); // Convert input to integer
                    await jiraResource.getLatestReleases(project_name, num_releases);
                } catch (error) {
                    console.log('Please enter a valid integer.');
                }
                break;

            case '3':
                // Create a new release version
                const version_name_create = readlineSync.question('\nInsert version name: ');
                const description = readlineSync.question('Insert version description: ');
                await jiraResource.createVersion(project_name, version_name_create, description);
                break;

            case '4':
                // Insert fixversion on tasks and sprint if wanted

                let task_ids_input = ''
                let task_ids = []

                const useInMemoryTasks = readlineSync.question(`\nUse previous created tasks? (y or n, defaultInput: y): `, { defaultInput: 'y' });
                if( useInMemoryTasks === 'y' ) {
                    inMemoryTasksId.forEach((id, idx) => {
                        console.log(`${id} - ${inMemoryTasksText[idx]}`);
                        task_ids.push(id)
                    });
                }else {
                    task_ids_input = readlineSync.question('\nInsert tasks separated by space: ');
                    task_ids = task_ids_input.split(' ');
                }

                const version_name_fix = readlineSync.question('\nInsert version name: ');
                await jiraResource.updateFixVersions(task_ids, project_name, version_name_fix);

                const addToSprint = readlineSync.question(`\nAdd tasks to a sprint? (y or n, defaultInput: y): `, { defaultInput: 'y' });
                if( addToSprint === 'y' ) {
                    const jiraResource2 = new JiraResource(personal_token, base_url+'/rest/agile/1.0');
                    const sprint = readlineSync.question(`\nInsert sprint ID (can be found in url ?rapidView=766&sprint=6991) :`);
                    await jiraResource2.addTasksToSprint(task_ids, sprint, project_name)
                }

                break;

            case '5':
                // Check if packageManager is initialized
                if (!packageManager) {
                    const projectDir = readlineSync.question(`\nInsert git project directory (defaultInput: C:\\dev\\git\\qa_insiderlog): `, { defaultInput: 'C:\\dev\\git\\qa_insiderlog' });
                    packageManager = new PackageVersionManager(projectDir);  // Initialize packageManager
                    git_directory = projectDir
                }
                const version_name = readlineSync.question("\nInsert the version name: ");
                const tasks_for_release = await jiraResource.getReleaseTasks(project_name, version_name, true);
                const release_notes_version_number = version_name.split(' ').pop();
                packageManager.updateReleaseNotes(release_notes_version_number, tasks_for_release);

                const package_version = version_name.split(' ').pop().split('v').pop();
                packageManager.updateVersion(package_version);
                break;

            case '6':
                // Check release tasks status
                const version_name_status = readlineSync.question('\nInsert the version name: ');
                await jiraResource.checkReleaseTasksStatus(project_name, version_name_status);
                break;

            case '7':
                // Auto Close all tasks
                const version_to_close = readlineSync.question('\nInsert the version name: ');
                const tasks_in_version = await jiraResource.getReleaseTasks(project_name, version_to_close);

                // using existing getReleaseTasks, so extract task keys from formatted strings
                const taskIds = tasks_in_version.map(task => task.match(/\[(.*?)\]/)[1]);

                await jiraResource.moveCardsToDone(taskIds);
                break;

            case '8':
                // Release a version
                const version_name_release = readlineSync.question('\nInsert version name: ');
                await jiraResource.releaseVersion(project_name, version_name_release);
                break;

            case '9':
                // Change Jira project name
                const new_project_name = readlineSync.question('\nInsert the new project name: ').toUpperCase();
                project_name = new_project_name;
                console.log(`Project changed to: ${project_name}`);
                break;

            case '10':
                // Change GIT project dir
                const projectDir = readlineSync.question("\nInsert git project directory: ");
                packageManager = new PackageVersionManager(projectDir);  // Initialize packageManager
                git_directory = projectDir
                console.log(`Project dir changed to: ${projectDir}`);
                break;

            case '0':
                console.log('Exiting program.');
                return;

            default:
                console.log('Invalid option, please choose between 1-7.');
        }
    }
}

main();
