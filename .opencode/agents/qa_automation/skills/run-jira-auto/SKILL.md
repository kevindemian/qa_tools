---
name: run-jira-auto
description: Run the Jira automation process to create issues from test cases
license: MIT
compatibility: opencode
metadata:
  audience: testers
  workflow: automation
---

## What I do
- Executes Jira CLI automation using generated test CSV with environment variables

## When to use me
- When test_steps.csv has been generated and Jira tickets must be created

## Steps

Run the following command:

bash:
CSV_PATH="jira_management/test_steps.csv" CSV_LABELS="rejectme" AUTO_CONFIRM=true JIRA_PROJECT=EQA AUTO_CHOICE=1 node jira_management/main.js
