# CLI reference

`renovate-auto-update` previews dependency maintenance before it writes files. Run it from the project containing `package.json`, or set another target with `--cwd`.

```bash
renovate-auto-update update
renovate-auto-update update --apply
```

Running without arguments opens guided interactive mode. It requires a TTY.

## Commands

| Command | Purpose | Writes by default? |
| --- | --- | --- |
| `update` | Preview eligible dependency updates. | No |
| `audit` | Review npm audit vulnerabilities and available fixes. | No |
| `check` | Enforce required maintenance in CI. Exits `2` when maintenance is required. | Never |
| `pin` | Preview exact dependency version ranges. | No |
| `about` | Show tool information. | Never |
| `completion <bash\|zsh\|fish>` | Print a shell-completion script. | Never |

`--apply` writes `package.json` for `update`, `audit`, and `pin` after the command has been reviewed. In guided mode, the same action requires a confirmation after the preview result.

## Update and pin options

| Option | Default | Description |
| --- | --- | --- |
| `--level <patch\|minor\|major>` | `minor` | Maximum update level. `patch` permits patch changes, `minor` permits patch and minor changes, and `major` permits any newer stable version. |
| `--skip <packages>` | none | Skip comma-separated packages. Repeat this option to add more packages. |
| `--no-update` | off | With `pin` only, remove version prefixes without fetching newer versions. |
| `-n`, `--dry-run` | on | Explicit preview marker. Every change-capable command previews by default. |
| `-y`, `--apply` | off | Write reviewed changes to `package.json`. |
| `--fix` | off | Deprecated alias for `--apply`. |

Examples:

```bash
renovate-auto-update update --level patch
renovate-auto-update update --skip react,lodash --skip typescript
renovate-auto-update update --level major --apply
renovate-auto-update pin --no-update
renovate-auto-update pin --apply
```

## Audit options

| Option | Default | Description |
| --- | --- | --- |
| `--min-severity <level>` | `high` | Minimum severity: `critical`, `high`, `moderate`, `low`, or `info`. |
| `--show-dep-chain` | off | Include chains for indirect vulnerabilities. |
| `-y`, `--apply` | off | Write direct dependency fixes or transitive overrides. |

```bash
renovate-auto-update audit
renovate-auto-update audit --min-severity moderate --show-dep-chain
renovate-auto-update audit --apply
```

`--skip` and `--level` do not apply to audit mode and are rejected with an actionable error.

## Check options

| Option | Default | Description |
| --- | --- | --- |
| `--level <patch\|minor\|major>` | `minor` | Update level that becomes mandatory. |
| `--min-severity <level>` | none | Also fail for vulnerabilities at or above this severity. |

```bash
renovate-auto-update check
renovate-auto-update check --level major --min-severity high
```

`check` is always read-only. `--apply` is rejected.

## Global options

| Option | Default | Description |
| --- | --- | --- |
| `-C`, `--cwd <path>` | current directory | Target directory containing `package.json`. |
| `--json` | off | Write exactly one result object to stdout. Errors remain JSON on stderr. |
| `-v`, `--verbose` | off | Show individual skipped packages and reasons. |
| `--color <auto\|always\|never>` | `auto` | Control color output. |
| `--no-color` | off | Alias for `--color never`. `NO_COLOR` is also respected. |
| `-h`, `--help` | off | Show general or command-specific help. `renovate-auto-update audit --help` works. |
| `-V`, `--version` | off | Print installed CLI version. |

Value options support either a separate value or an equals sign:

```bash
renovate-auto-update update --level patch
renovate-auto-update update --level=patch
renovate-auto-update update -C /work/api
```

## Legacy flags

Existing scripts remain supported. Legacy mode flags map to named commands and now follow the same preview-first safety model:

| Legacy flag | Named command |
| --- | --- |
| `--audit` | `audit` |
| `--mandatory-update-check` | `check` |
| `--pin` | `pin` |
| `--about` | `about` |

Use `--apply` instead of `--fix` in new scripts. Conflicting or irrelevant options are rejected and include a suggestion where possible.

## Shell completion

Print a completion script for your shell:

```bash
renovate-auto-update completion bash
renovate-auto-update completion zsh
renovate-auto-update completion fish
```

Install the resulting script using your shell's normal completion setup.

## Output and exit codes

Human output includes target path, operation mode, grouped changes, compact skip counts, and an install command chosen from `packageManager` metadata or lockfiles. Use `--verbose` to expand skip reasons.

With `--json`, success writes one result object to stdout and errors write `{ "error", "code": "CLI_ERROR" }` to stderr. JSON result contracts are defined by:

- [Update result schema](schemas/update-result.schema.json)
- [Audit result schema](schemas/audit-result.schema.json)
- [Mandatory result schema](schemas/mandatory-result.schema.json)
- [CLI error schema](schemas/cli-error.schema.json)

| Code | Meaning |
| ---: | --- |
| `0` | Command completed successfully, including a passing check. |
| `1` | Invalid input, configuration, audit, network, or operational error. |
| `2` | `check` found mandatory updates or selected vulnerabilities. |

Set `RENOVATE_AUTO_UPDATE_TIMINGS=1` to write audit, metadata-prefetch, and update timings to stderr.