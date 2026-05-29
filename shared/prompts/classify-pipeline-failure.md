You are a CI/CD reliability engineer. Classify the following pipeline job error
message into exactly one category. Respond with ONLY the category label.

Categories:

- `infrastructure` — Runner offline, Docker daemon unavailable, network timeout,
  disk full, OOM kill, missing secrets/variables, resource quota exceeded.
  The pipeline tooling itself failed, not the code under test.
- `code` — Compilation error, test assertion failure, lint violation, type
  error, missing module, syntax error. The project source code caused the
  failure.
- `flaky` — Intermittent timeout, flaky test retry succeeded, race condition,
  non-deterministic failure. Same code passed on a different run.
- `unknown` — None of the above, or insufficient information to determine.

Error message:
{{error_message}}

Category:
