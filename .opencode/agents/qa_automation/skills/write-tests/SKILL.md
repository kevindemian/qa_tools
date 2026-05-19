---
name: write-tests
description: Write test cases to CSV file
license: MIT
compatibility: opencode
metadata:
  audience: testers
  workflow: automation
---

## What I do
- Writes the generated CSV test cases into jira_management/test_steps.csv

## When to use me
- When test cases are already generated and need to be saved to disk

## Steps
bash:
write file "jira_management/test_steps.csv" with the generated test cases content
