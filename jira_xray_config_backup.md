# Jira, Xray & CI/CD Comprehensive Environment Backup

This document serves as the absolute, single source of truth for all environment configurations, endpoints, credentials, local files metadata, business logic, and custom integrations within the `qa_tools-FORK` project.

---

## 1. Active Environment Credentials (.env)

The application loads settings from the `.env` file located at the project root. Below are the exact configuration variables, their purposes, and the active values retrieved from the current environment:

### Credentials & Connections

| Variable              | Description                                                     | Active Backup Value / Example                                                                   |
| :-------------------- | :-------------------------------------------------------------- | :---------------------------------------------------------------------------------------------- |
| `JIRA_BASE_URL`       | Base domain/URL of the Jira enterprise server.                  | `https://jiraprod.srv.euronext.com`                                                             |
| `JIRA_PERSONAL_TOKEN` | Bearer personal access token for Jira API authentication.       | `NTc0MjMwNzg5MDcxOoXlL2xT0Nh2kr24Oca2jp9g7mrw`                                                  |
| `JIRA_USER_EMAIL`     | Email associated with the Jira connection/user.                 | `kevin.borges.contractor@euronext.com`                                                          |
| `XRAY_BASE_URL`       | Complete base URL path specifically for the Xray REST API v2.   | `https://jiraprod.srv.euronext.com/rest/raven/2.0/api`                                          |
| `GIT_TOKEN`           | Authentication Token for GitLab API interaction (Git triggers). | _(Supplied at runtime or global environment)_                                                   |
| `GIT_BASE_URL`        | Base domain/URL of the GitLab instance.                         | _(Supplied at runtime or global environment)_                                                   |
| `GITHUB_TOKEN`        | GitHub Personal Access Token for git trigger actions.           | `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` |
| `GITHUB_API_URL`      | API Base URL for GitHub (defaults to api.github.com if unset).  | `https://api.github.com`                                                                        |

### Paths & Execution Defaults

| Variable               | Description                                                           | Active Backup Value / Example                            |
| :--------------------- | :-------------------------------------------------------------------- | :------------------------------------------------------- |
| `CSV_DEFAULT_PATH`     | Default fallback filesystem path for CSV files containing test cases. | `C:\dev\qa_tools\jira_management\test_steps.csv`         |
| `CYPRESS_PROJECT_PATH` | Path where generated mapping files and test results will be located.  | _(Defined dynamically or read from environment / state)_ |
| `CSV_LABELS`           | Comma-separated Jira labels applied to issues imported from CSV.      | _(Optional / comma-separated list)_                      |
| `JSON_LABELS`          | Comma-separated Jira labels applied to issues imported from JSON.     | _(Optional / comma-separated list)_                      |

### Operational Control Switches

| Variable       | Description                                                                                          | Values / Defaults |
| :------------- | :--------------------------------------------------------------------------------------------------- | :---------------- |
| `AUTO_CONFIRM` | Bypasses all CLI prompts and confirmations when set to `true`.                                       | `true` / `false`  |
| `DRY_RUN`      | Simulates test/execution creation without making actual network requests to Jira when set to `true`. | `true` / `false`  |
| `DEBUG`        | Prints extensive debug logs (including base URLs and masked tokens) when set to `true`.              | `true` / `false`  |
| `QUIET`        | Disables verbose command line output and tables when set to `true`.                                  | `true` / `false`  |

### System Logs Control (`shared/logger.js`)

| Variable       | Description                                                                     | Values / Defaults           |
| :------------- | :------------------------------------------------------------------------------ | :-------------------------- |
| `LOG_FILE`     | Enable writing application logs to a local file when set to `true`.             | `true` / `false`            |
| `LOG_DIR`      | Custom directory where the application log files are stored.                    | Defaults to `logs`          |
| `LOG_MAX_SIZE` | Maximum file size in bytes before rotating log files.                           | Defaults to `5242880` (5MB) |
| `LOG_LEVEL`    | Logging filter level for terminal/file logs (`DEBUG`, `INFO`, `WARN`, `ERROR`). | Defaults to `INFO`          |

---

## 2. Local Configuration Files Dumps (Metadata)

These JSON files reside under the `/config` directory and manage the mappings between testing suites, repositories, and reviewer structures.

### A. Projects ID Mappings (`config/projects.json`)

Maps individual testing suites keys to their corresponding GitLab/GitHub project repository IDs.

```json
{
    "qa_ibabs": "47849962",
    "qa_ibabs_cast": "64210552",
    "qa_insiderlog": "39673943",
    "qa_policylog": "62454464",
    "qa_integritylog": "43908945",
    "qa_irmanager": "41268567",
    "qa_newslog": "62454464",
    "qa_tools": "62689551"
}
```

_Note: Any environment variable defined as `PROJECT_ID_<PROJECT*KEY_UPPERCASE>`(e.g.`PROJECT_ID_QA_TOOLS`) will dynamically override these JSON map values at runtime.*

### B. Project Provider Mappings (`config/providers.json`)

Defines the repository management engine (GitLab or GitHub) and optionally the repository name mapping.

```json
{
    "qa_ibabs": { "provider": "gitlab" },
    "qa_ibabs_cast": { "provider": "gitlab" },
    "qa_insiderlog": { "provider": "gitlab" },
    "qa_policylog": { "provider": "gitlab" },
    "qa_integritylog": { "provider": "gitlab" },
    "qa_irmanager": { "provider": "gitlab" },
    "qa_newslog": { "provider": "gitlab" },
    "qa_tools": { "provider": "gitlab" }
}
```

### C. Standard Reviewers Pool (`config/reviewers.json`)

Lists corporate user/reviewer IDs for automated merge request / pull request approvals:

```json
[12161752, 14566471, 23136801, 23422965, 23515703, 24922000]
```

---

## 3. Authentication Mechanisms

### A. Jira & Xray Credentials

The `JiraResource` class constructor instantiates an HTTP client with headers configured for Bearer token authentication:

- **Header Name**: `Authorization`
- **Format**: `Bearer <personal_token>`
- **Implementation**: Utilizes `createHttpClient` inside `shared/http-client.js`.

### B. GitLab API Authentication

The `GitLabManager` class connects to GitLab v4 endpoints using a private token:

- **Header Name**: `PRIVATE-TOKEN`
- **Format**: `<apiToken>` (from `GIT_TOKEN`)

### C. GitHub API Authentication

The `GitHubManager` class connects to GitHub REST API using a personal token:

- **Header Name**: `Authorization`
- **Format**: `Bearer <apiToken>` (from `GITHUB_TOKEN` or `GIT_TOKEN`)

---

## 4. Endpoints Directory

### Jira API Endpoints (`/rest/api/2`)

| Endpoint Path (Relative to Jira Base) | HTTP Method | Description & Usage                                                    | Payload / Parameters                                            |
| :------------------------------------ | :---------- | :--------------------------------------------------------------------- | :-------------------------------------------------------------- |
| `/search`                             | `GET`       | Searches issues using JQL queries. Supports pagination.                | `jql`, `maxResults`, `startAt` (Query Params)                   |
| `/issue`                              | `POST`      | Creates a single issue (e.g., Test or Test Execution).                 | `{ fields: { project, summary, description, issuetype, ... } }` |
| `/issue/{issueKey}`                   | `GET`       | Retrieves details (fields, links) of a specific issue.                 | _None_                                                          |
| `/issue/{issueKey}`                   | `PUT`       | Updates fields of a specific issue (e.g., preconditions, description). | `{ fields: { <customfield_id>: <value> } }`                     |
| `/issue/{issueKey}/transitions`       | `GET`       | Gets all possible status transitions for a specific issue.             | _None_                                                          |
| `/issue/{issueKey}/transitions`       | `POST`      | Performs a status transition on an issue.                              | `{ transition: { id: <transition_id> } }`                       |
| `/project/{projectName}`              | `GET`       | Retrieves project details (like project ID) by key name.               | _None_                                                          |
| `/project/{projectId}/versions`       | `GET`       | Gets all versions configured under a specific project.                 | _None_                                                          |
| `/version`                            | `POST`      | Creates a new release version for a project.                           | `{ description, name, project, released: false }`               |
| `/version/{versionId}`                | `PUT`       | Updates version attributes (e.g., marks as released).                  | `{ releaseDate, released: true }`                               |
| `/sprint/{sprintId}/issue`            | `POST`      | Assigns an array of issue keys to a specified sprint.                  | `{ issues: [ "KEY-1", "KEY-2" ] }`                              |
| `/issuetype`                          | `GET`       | Dynamically discovers available issue types for schemes.               | _None_                                                          |
| `/field`                              | `GET`       | Dynamically discovers custom and standard fields in Jira.              | _None_                                                          |
| `/issueLinkType`                      | `GET`       | Dynamically retrieves all configured issue link type relations.        | _None_                                                          |
| `/issueLink`                          | `POST`      | Links two issues together with a specific relation direction.          | `{ type: { id }, inwardIssue: { key }, outwardIssue: { key } }` |

### Xray API Endpoints

| Endpoint Path (Relative to Xray Base) | HTTP Method | Description & Usage                                    | Payload / Parameters                             |
| :------------------------------------ | :---------- | :----------------------------------------------------- | :----------------------------------------------- |
| `/test/{issueKey}/steps`              | `POST`      | Adds/overwrites test steps for a specified Test issue. | `{ index: <num>, Action, Data, ExpectedResult }` |

### GitLab Integration Endpoints (`/api/v4/projects/{projectId}`)

| Endpoint Path                     | HTTP Method    | Description & Usage                                               |
| :-------------------------------- | :------------- | :---------------------------------------------------------------- |
| `/pipeline`                       | `POST`         | Dispatches a GitLab CI Pipeline execution.                        |
| `/pipeline_schedules`             | `GET`          | Lists all configured pipeline schedules.                          |
| `/pipeline_schedules/{id}/play`   | `POST`         | Triggers a schedule run manually.                                 |
| `/merge_requests`                 | `POST` / `GET` | Creates or searches for open merge requests.                      |
| `/merge_requests/{iid}`           | `PUT` / `GET`  | Updates or retrieves merge request parameters.                    |
| `/merge_requests/{iid}/merge`     | `PUT`          | Approves and performs the branch merge execution.                 |
| `/pipelines`                      | `GET`          | Lists recent pipelines.                                           |
| `/pipelines/{pipelineId}/jobs`    | `GET`          | Lists all execution jobs and artifacts references for a pipeline. |
| `/jobs/{jobId}/artifacts`         | `GET`          | Downloads ZIP stream of build artifacts.                          |
| `/merge_requests/{iid}/approvals` | `GET`          | Verifies merge approval status checks.                            |
| `/variables`                      | `GET`          | Retrieves project-level CI/CD environment variables.              |

### GitHub Integration Endpoints (`/repos/{owner}/{repo}`)

| Endpoint Path                        | HTTP Method     | Description & Usage                               |
| :----------------------------------- | :-------------- | :------------------------------------------------ |
| `/actions/workflows`                 | `GET`           | Lists repository workflows.                       |
| `/actions/workflows/{id}/dispatches` | `POST`          | Triggers manual GitHub action run.                |
| `/pulls`                             | `POST` / `GET`  | Creates, searches, or fetches pull requests.      |
| `/pulls/{iid}`                       | `PATCH` / `GET` | Updates or retrieves pull request details.        |
| `/pulls/{iid}/merge`                 | `PUT`           | Performs the pull request merge operation.        |
| `/actions/runs`                      | `GET` / `GET`   | Lists pipeline execution runs or fetches details. |
| `/actions/runs/{runId}/jobs`         | `GET`           | Lists individual run jobs.                        |
| `/actions/runs/{runId}/artifacts`    | `GET`           | Lists artifacts of a run.                         |
| `/actions/artifacts/{id}/zip`        | `GET`           | Downloads workflow artifacts as ZIP file.         |
| `/actions/variables`                 | `GET`           | Lists repository action environment variables.    |
| `/pulls/{iid}/reviews`               | `GET`           | Checks reviewers approval status.                 |

---

## 5. Issue Types & Field Mappings

### Standard Jira Issue Types Used

- **`Test`**: Custom issue type configured via Xray to document a manual/automated test case.
- **`Test Execution`**: Custom issue type configured via Xray representing a collection of test cases with statuses for a specific run.

### Dynamic Custom Fields Discovery

Instead of hardcoding field IDs, the application dynamically queries `/field` to match metadata schemas:

1.  **Test Execution Association**:
    - **Schema Pattern**: `com.xpandit.plugins.xray:testexec-tests-custom-field`
    - **Usage**: Maps the array of associated Test keys directly inside a newly created Test Execution payload under this custom field ID.
2.  **Precondition Association**:
    - **Schema Pattern**: `com.xpandit.plugins.xray:test-precondition-custom-field`
    - **Usage**: Appends pre-condition issue keys under this custom field ID.
    - **Fallback Field ID**: `customfield_13708`

### Standard Fields Configured

- `project`: `{ key: "PROJECT_NAME" }`
- `summary`: Plain text title.
- `description`: Plain text description (pre-conditions inline are appended at the end).
- `issuetype`: `{ name: "Test" }` or `{ id: "<discovered_id>" }` (e.g. for Test Execution).
- `labels`: Array of strings (`["label1", "label2"]`).
- `fixVersions`: Array of version setting objects (`{ set: [{ id: "<version_id>" }] }`).

---

## 6. Input Data Formats (CSV & JSON)

Test cases are imported through structured CSV or JSON formats modeled after `test_cases_template.json` and `test_steps_template.csv`.

### CSV Bulk Format Specification

Tests in CSV files are separated by lines containing triple dashes (`---`). Each test block consists of key-value fields:

- **`Title`** _(Mandatory)_: Main title of the test.
- **`Description`**: Detailed purpose.
- **`Pre-condition`**: Jira issue reference key (e.g., `ECSPOL-PRE-42`) or inline plain text.
- **`Group`**: String name to group related tests for description mutual referencing.
- **`Linked Issues`**: Comma-separated or structured issue keys to link to.
- **Steps Columns**:
    - **`Step Action`**: Action taken.
    - **`Step Data`**: Parameters/data.
    - **`Step Expected Result`**: Expected outcome.

### JSON Structure Specification

JSON files must contain an array of objects matching the following JSON schema representation:

```json
[
    {
        "title": "ECSPOL-TC01 - Login com credenciais validas",
        "description": "Verifica o fluxo feliz de login do administrador no sistema.",
        "precondition": "ECSPOL-PRE-42",
        "group": "LOGIN-FLOW",
        "steps": [
            {
                "Action": "Acessar /login",
                "Data": "https://app.example.com",
                "ExpectedResult": "Formulario de login exibido"
            }
        ],
        "linkedIssues": [
            "ECSPOL-100",
            {
                "key": "ECSPOL-200",
                "linkType": "is tested by"
            }
        ]
    }
]
```

### Parsing Rules & Field Resolutions

- **Preconditions**:
    - If value matches pattern `^[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*-\d+$` (e.g. `ECSPOL-PRE-12`), it resolves to `type: 'reference'`.
    - Otherwise, it resolves to `type: 'inline'` and is appended directly into the Test issue `description`.
- **Linked Issues**:
    - If specified as a pure string, defaults to `linkType: 'Tests'`.
    - If specified as an object, maps directly to `{ key, linkType }`.

---

## 7. Business & Import Logic

The import processes in `create_tests.js` implement the following safeguards and features:

### 1. Checkpoint & Resume Mechanism

- If a bulk creation operation gets interrupted, a state checkpoint is written to database state (`_checkpoint`).
- On subsequent executions of the same source path and project, the CLI prompts the user to resume from the last successful index, saving time and preventing duplicates.

### 2. Group Cross-Referencing

- If tests specify a common `Group` (case-insensitive), the script automatically retrieves all created keys in that group.
- It then updates the Jira description of each test in the group to include: `\n\nThis test case is part of the set <GROUP_NAME>: <MEMBER_KEY_1>, <MEMBER_KEY_2>, ...`

### 3. Output Mapping Generation

Upon successful Test creation, mapping files are generated and stored in the Cypress project directory (`CYPRESS_PROJECT_PATH`):

- **`{baseName}-jira-mapping.json`**: Structure containing project name, source path, timestamp, and mapped keys-to-titles relations.
- **`{baseName}-jira-mapping.md`**: Human-readable test specifications in markdown tables.
- **`{baseName}-summary.txt`**: Flat mapping list of `<issueKey>: <title>`.

### 4. Link Types Fallback Cache

When linking issues, `jira_link_manager.js` retrieves link types. To guard against network failures:

- First, tries retrieving from `/issueLinkType` and caches to `~/.qa_tools_link_types_cache.json`.
- On API failure, reads the local cache file.
- If both fail, uses fallback mappings:
    - `Relates`: `11701` (inward: relates to, outward: relates to)
    - `Tests`: `10201` (inward: is tested by, outward: tests)
    - `Tested by`: `10200` (inward: tested by, outward: tests)

---

## 8. Issue Status Transitions Workflow

Automatic transition closure maps current case-insensitive statuses to sequentially executable actions:

```javascript
workflowMap = {
    new: ['approve', 'use test case'],
    'coding in progress': ['coding done', 'done'],
    'coding done': ['done'],
    approve: ['use test case'],
};
```

---

## 9. Built-in Interactive CLI Help Topics

The following topics are documented directly in the application's CLI for runtime reference:

- `csv`: Format description, block separators, mandatory vs optional fields.
- `labels`: Specifications for comma-separated Jira labels.
- `group`: Description of automated mutual cross-referencing descriptions.
- `precondition`: References vs inline plain text insertion rules.
- `project`: Automatically checks project key existence.
- `version`: Explanations on creating project release versions.
- `transitions`: Describes the automated issue workflows (New -> Approve -> Coding -> Done).
- `template`: Guide on generating default templates.
- `diagnostics`: Option 12 details, checking connectivity parameters to Jira API, Xray API, response times, and HTTP status verification.
