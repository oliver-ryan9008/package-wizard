# JSON schemas

These schemas describe contracts emitted or consumed by `renovate-auto-update`.

- `update-result.schema.json`: default update and dry-run output.
- `audit-result.schema.json`: audit and vulnerability-fix output.
- `mandatory-result.schema.json`: mandatory update-check output.
- `cli-error.schema.json`: JSON error written to stderr when `--json` is active.
- `renovate-config.schema.json`: Renovate configuration fields validated by this tool.

Schemas use JSON Schema Draft 2020-12. They describe this tool's supported subset;
they are not a replacement for Renovate's full configuration schema.
