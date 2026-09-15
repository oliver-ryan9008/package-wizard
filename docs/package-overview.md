# package-wizard, in plain English

`package-wizard` is a small npm tool for keeping a project's dependencies current.

It can be used as either:

- A command-line tool run from an npm script or with `npx`.
- A TypeScript/JavaScript library imported into another script.

Point it at a project and it reads that project's `package.json`. Depending on the command, it can preview patch, minor, or major updates, review `npm audit` fixes, check for required updates, or preview pinned dependency versions. `--apply` writes reviewed changes. It understands native `package.wizard.*` configuration, `renovate.json`, npm-check-updates' `.ncurc.json`, and Dependabot's `.github/dependabot.yml`, so package exclusions remain consistent during normal updates and audit fixes.

Peer compatibility checking is opt-in for updates. Use `--check-peer-deps` or
set `peerDependencies.strategy` to `strict` to validate candidate updates with
npm's resolver. Strict checks include peer dependencies and dependency
`engines.node` and `engines.npm` constraints against the current runtime.

When run without arguments in a terminal, it shows the current target
`package.json` path before opening a guided task flow. Users choose a preview,
security audit, maintenance check, or pinning task and see only relevant
settings. Preview results are grouped by dependency section, summarize skipped
packages, and offer an explicit apply confirmation. Human output stays readable
at narrow terminal widths; `--json` keeps one compact result on stdout for
scripts, pipelines, and API integrations.

For the complete command-line option list, modes, output formats, and exit
codes, see the [CLI reference](cli-reference.md). For installation and library
examples, see [using as a project dependency](usage.md).

## Update behavior

The updater reads these dependency sections from the target `package.json`:
`dependencies`, `devDependencies`, `optionalDependencies`, and
`peerDependencies`.

It supports exact versions and simple caret or tilde ranges, such as `1.2.3`,
`^1.2.3`, and `~1.2.3`. Existing `^` and `~` prefixes are preserved unless
the `pin` command is used. With `pin --no-update`, prefixes are removed without
selecting a newer version.

Tags, `workspace:`, `file:`, URL, Git, invalid, and compound range specs are
skipped and reported. Updates are also skipped when no eligible version exists,
when a package is excluded by `--skip`, or when configured dependency rules
reject the candidate.

The default update level is `minor`: patch and minor updates are eligible, but
major updates are not. `patch` allows patch updates only; `major` and `all`
allow any newer stable version within the configured policies. Prerelease versions are
ignored by default, and updates do not move past npm's `latest` tag by default.

New versions are not subject to a release-age filter by default. Configure
`minimumReleaseAge` in a supported configuration file with a duration such as
`"3 days"`, a number of milliseconds, or `false` to disable the filter. Use
`minimumReleaseAgeBehavior: "timestamp-optional"` when releases without
publication timestamps should remain eligible. The result reports blocked
versions as release-age warnings and installed versions that violate the policy
as release-age errors.

## Audit behavior

Audit mode runs `npm audit --json`. It considers vulnerabilities at `high` or
`critical` severity by default; use `--min-severity` to choose another minimum.
Audit mode previews changes by default. `audit --apply` writes reviewed fixes.
Available fixes can update a
direct dependency or add an `overrides` entry for a transitive dependency.
Disabled or ignored packages are not changed and do not receive overrides.

The `vulnerabilityAlerts.vulnerabilityFixStrategy` setting controls which
available version is selected: `"lowest"` is the default and `"highest"`
selects the highest available fix. `--show-dep-chain` includes the dependency
chain for indirect vulnerabilities.

## Dependency configuration

The tool understands native `package.wizard.*` configuration, `renovate.json`,
npm-check-updates' `.ncurc.json`, and Dependabot's
`.github/dependabot.yml`. It checks native files in this order:

1. `package.wizard.ts`
2. `package.wizard.mjs`
3. `package.wizard.js`
4. `package.wizard.json`

The first native file found is authoritative; fallback files are ignored. If no
native file exists, the tool checks `renovate.json`, `.ncurc.json`, and
`.github/dependabot.yml` in that order. If none exist, built-in defaults apply.
Malformed JSON/YAML or invalid supported field types fail the operation.

### Fallback configuration

Fallback configuration settings include:

- `ignoreDeps` to exclude named packages.
- `allowedVersions` in package rules, using a SemVer range or `/regex/`.
- `ignoreUnstable`, `respectLatest`, and `updatePinnedDependencies` at the root
	or in matching package rules.
- `matchPackageNames`, `matchPackagePatterns`, `matchPackagePrefixes`, and
	`matchDepTypes` to target package rules.
- `matchUpdateTypes` to target patch, minor, or major updates in Renovate,
  Dependabot, and other fallback configuration semantics.
- `enabled: false` in a package rule to exclude matching packages completely.

In fallback configs, package rules combine package and dependency-section
matchers. A disabled rule with no matchers applies to every package. Root
`enabled: false` is ignored; package-rule `enabled: false` is the supported
exclusion mechanism.

### Native package-wizard configuration

Use `package.wizard.json` when dependency policy is owned by this tool. The
same shape can be authored in `package.wizard.ts`, `package.wizard.mjs`, or
`package.wizard.js` with `definePackageWizardConfig`:

```json
{
	"$schema": "https://raw.githubusercontent.com/oliver-ryan9008/package-wizard/main/docs/schemas/package-wizard.schema.json",
	"ignore": ["left-pad"],
	"defaults": {
		"minimumReleaseAge": "3 days",
		"respectLatest": true
	},
	"packages": {
		"react": { "allowedVersions": "^18" },
		"@types/*": { "enabled": false }
	},
	"rules": [
		{ "packageName": "typescript", "updatePinnedDependencies": false }
	]
}
```

`packageName` is the preferred selector for ordered rules. The deprecated
`package` selector remains supported for compatibility.

`packages` keys can be exact names or `*` wildcards. `rules` supports the same
policy fields and applies in declaration order. `ignore` excludes exact package
names. The `defaults` object supplies baseline settings; release-age settings
belong there and are disabled when omitted. Native package-wizard rules use
`enabled` to control all update types. Use
`enabledUpdateTypes` to allow only selected levels, or
`disabledUpdateTypes` to block selected levels while leaving other levels
eligible. Each field accepts one value or an array containing `patch`,
`minor`, `major`, and `all`. `all` expands to `patch`, `minor`, and `major`.

```json
{
	"packages": {
		"react": {
			"enabled": true,
			"disabledUpdateTypes": "major"
		},
		"typescript": {
			"enabledUpdateTypes": ["patch", "minor"]
		}
	}
}
```

Native rules must not use `matchUpdateTypes`; that field belongs to fallback
Renovate configuration. The tool reports an
actionable error when a rule overlaps enabled and disabled update types, when
`enabled: false` is combined with `enabledUpdateTypes`, or when repeated exact
selectors specify conflicting values. Remove the conflicting field or combine
the policies into one rule. These validation rules apply only to native
package-wizard files; fallback configuration semantics remain unchanged.

Add the schema URL to `package.wizard.json` for editor completion and hover
validation. The complete schema is in
[package-wizard.schema.json](schemas/package-wizard.schema.json). Published
installs also expose it as `package-wizard/schema.json`.

```ts
import { definePackageWizardConfig } from "package-wizard"

export default definePackageWizardConfig({
	ignore: ["left-pad"],
	packages: {
		"@types/*": { enabled: false }
	}
})
```

Audit and mandatory-update defaults can be configured separately from package
rules. CLI flags override these values:

```json
{
	"audit": {
		"minSeverity": "moderate",
		"showDepChain": true,
		"vulnerabilityFixStrategy": "highest"
	},
	"mandatoryUpdates": {
		"level": "major",
		"minSeverity": "high"
	},
	"peerDependencies": {
		"strategy": "strict"
	}
}
```

`audit.minSeverity` accepts `critical`, `high`, `moderate`, `low`, or `info`.
`audit.showDepChain` controls indirect vulnerability chain output, and
`audit.vulnerabilityFixStrategy` accepts `lowest` or `highest`.
`mandatoryUpdates.level` accepts `all`, `patch`, `minor`, or `major`; its
`minSeverity` uses the same severity values. These settings apply when the
corresponding CLI option is omitted.
`peerDependencies.strategy` accepts `ignore` or `strict` and defaults to
`ignore`. Strict mode uses npm's resolver with `--strict-peer-deps` and
`--engine-strict` to reject peer- or engine-incompatible update candidates.
The update-only `--check-peer-deps` option enables strict mode for one run and
overrides this setting. The guided menu asks about it immediately after the
package-skip prompt. The menu also provides a `Check peer dependencies` task,
which checks the current dependency set without changing files.

Candidate checks are sequential. If a candidate fails, older candidates for
that same package can be tried. The updater does not globally backtrack to
change an earlier package after a later package fails compatibility.

## Technologies it uses

### TypeScript

The source is written in TypeScript. That gives the public library API clear types and catches many mistakes before the package is built.

The package runs on modern Node.js, using Node's file-system, process, and child-process APIs. It uses native ESM modules and publishes both ESM and CommonJS-compatible entry points.

### npm

The tool delegates package metadata and vulnerability work to npm commands. That keeps it aligned with npm's own dependency and audit behavior instead of maintaining a second registry client.

### `semver`

Dependency versions are parsed and compared with `semver`. This is what lets the tool distinguish patch, minor, and major changes while preserving ranges such as `^1.2.3` and `~1.2.3`.

### `@clack/prompts` and `chalk`

These packages handle the interactive experience:

- `@clack/prompts` provides guided prompts and stable progress indicators.
- `chalk` adds restrained color to make results easier to scan.

Package names are shown during longer metadata work, and the same Clack visual vocabulary is used for prompts and progress.

### Jest, ESLint, and tsdown

Jest tests the behavior, ESLint checks code quality, and TypeScript checks types. `tsdown` bundles the final package for publishing without bundling external dependencies unnecessarily.

## A few ways it was made faster

These optimizations mainly reduce repeated work. They do not change what npm reports, and they do not replace npm with direct registry requests.

### Metadata caching

When several parts of a run ask about the same package, the result is reused. One package should not require several identical npm metadata calls.

### Bounded concurrency

Independent package lookups can run at the same time, but only up to a fixed limit. This improves speed without launching an uncontrolled pile of child processes.

### Prefetching

The tool gathers likely package metadata before evaluating every update one by one. That keeps the slower external work moving while the local policy checks remain orderly.

### Dependency-chain caching

Audit and update logic can inspect dependency relationships. Those relationships are cached so the same dependency chain is not walked repeatedly.

### Direct dependency indexing

The package builds quick indexes for direct dependencies and fixed package names. Later checks use those indexes instead of repeatedly scanning every dependency section.

### Precomputed update targets

The tool calculates eligible dependency targets once and reuses them. This avoids repeating the same filtering and section traversal during a run.

### Cached Renovate matchers

Renovate package rules may contain regular expressions. Compiled matchers are cached, which avoids recompiling the same patterns for every package.

### One-time release-age parsing

The `minimumReleaseAge` setting is parsed once and reused while versions are evaluated. Small saving, but useful when a project has many dependencies.

### Atomic `package.json` writes

When changes are written, the file is replaced atomically. An interrupted write is much less likely to leave behind half-written JSON.

## Why the output is structured

Normal output is designed for people. JSON mode is designed for scripts and CI, with successful JSON on stdout and structured errors on stderr. That separation means another tool can consume results without accidentally parsing spinner text or diagnostics. Human result output recommends the install command for the target's configured package manager or lockfile.

The CLI also uses distinct exit codes: `0` for success, `1` for operational errors, and `2` when a mandatory update policy fails.

## Development commands

```bash
npm test            # lint, typecheck, and run Jest
npm run lint        # run ESLint
npm run check-types # run tsc --no-emit to check for TS errors
npm run build       # typecheck and create publishable bundles
```
