# JSON schemas

These schemas describe contracts emitted or consumed by `package-wizard`.

- `package-wizard.schema.json`: native `package.wizard.json` configuration.
- `update-result.schema.json`: default update and dry-run output.
- `audit-result.schema.json`: audit and vulnerability-fix output.
- `mandatory-result.schema.json`: mandatory update-check output.
- `cli-error.schema.json`: JSON error written to stderr when `--json` is active.
Schemas use JSON Schema Draft 2020-12. The native configuration schema is for
`package.wizard.json`; result schemas describe JSON emitted by the CLI.
The Renovate, npm-check-updates, and Dependabot schemas remain owned by their
respective projects.
