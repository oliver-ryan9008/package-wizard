# package-wizard

[![npm version](https://img.shields.io/npm/v/package-wizard.svg)](https://www.npmjs.com/package/package-wizard)
[![Node.js 22+](https://img.shields.io/badge/node-%3E%3D22-22c55e.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/oliver-ryan9008/package-wizard/actions/workflows/ci.yml/badge.svg)](https://github.com/oliver-ryan9008/package-wizard/actions/workflows/ci.yml)

`package-wizard` is an npm library and CLI for previewing, reviewing, and applying dependency maintenance. It respects your project's `renovate.json` configuration, so disabled packages are never touched. Every change-capable command previews first; `--apply` is required to write `package.json`.

## Install

To run without installing it to `package.json`, just run:

```bash
npx package-wizard@latest update
```

For use within another project's dependencies, see [using as a project dependency](https://github.com/oliver-ryan9008/package-wizard/blob/main/docs/usage.md).

## Guided terminal experience

Running `package-wizard` without arguments opens an interactive [Clack](https://github.com/bombshell-dev/clack) flow. It shows the selected target project, then guides users through update scope, audit severity, policy checks, pinning, exclusions, and target selection. Interactive mode requires a TTY; use an explicit command in scripts and CI.

The default task is a preview. After results are shown, interactive mode offers an explicit **Apply changes** confirmation. Direct commands require `--apply` to write.


```bash
package-wizard update
package-wizard audit
package-wizard check
package-wizard pin --no-update
package-wizard update --level major --apply
```

## Terminal ergonomics

Use `--help` for concise command-specific help, `--verbose` for every skipped-package reason, and `--color auto|always|never` or `--no-color` for display control. `--json` writes one machine-readable result to stdout.

Shell completion scripts are available for bash, zsh, and fish:

```bash
package-wizard completion zsh
package-wizard completion bash
package-wizard completion fish
```

For explanations of package behavior, update policies, audit handling, and
`renovate.json` configuration, see the [package overview](https://github.com/oliver-ryan9008/package-wizard/blob/main/docs/package-overview.md).

For installation in another project's dependencies, scripts, direct CLI usage, or library usage, see [using as a project dependency](https://github.com/oliver-ryan9008/package-wizard/blob/main/docs/usage.md).

## Contributing

Install dependencies, make your changes, and run the full validation suite:

```bash
npm install
npm run test
npm run build
```

Open a merge request with focused changes and tests where appropriate. Use
[Conventional Commits](https://www.conventionalcommits.org/) for commit
messages, for example:

```text
feat: add dependency update policy
fix: handle missing package metadata
docs: clarify interactive menu usage
```

Releases use semantic release. Merging Conventional Commits to the release
branch determines the next version, changelog, and Git tag automatically; do
not edit the package version manually for normal changes.

The repository's `Conventional Commits` pull request check must be required in
branch protection. The release workflow runs on pushes to `main` and requires
an `NPM_TOKEN` repository secret with permission to publish `package-wizard`.
