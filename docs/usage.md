# Using as a project dependency

Install `package-wizard` in the project whose dependencies you want to
manage:

```bash
npm install --save-dev package-wizard
```

You can then add commands to that project's `package.json`:

```json
{
  "scripts": {
    "deps:preview": "package-wizard update",
    "deps:apply": "package-wizard update --apply",
    "deps:check": "package-wizard check",
    "deps:audit": "package-wizard audit"
  }
}
```

Run them from the project directory:

```bash
npm run deps:preview
npm run deps:apply
npm run deps:check
npm run deps:audit
```

## Configure dependency policy

For package-wizard-owned policy, create one native configuration file in the
target project. Discovery order is `package.wizard.ts`, `package.wizard.mjs`,
`package.wizard.js`, then `package.wizard.json`; the first file found wins and
is authoritative over fallback configuration. Without a native file,
package-wizard checks `renovate.json`, `.ncurc.json`, then
`.github/dependabot.yml`.

JSON configuration can use the native schema for editor completion:

```json
{
  "$schema": "https://raw.githubusercontent.com/oliver-ryan9008/package-wizard/main/docs/schemas/package-wizard.schema.json",
  "ignore": ["example-package"],
  "defaults": {
    "enabledUpdateTypes": ["patch", "minor"]
  },
  "audit": {
    "minSeverity": "moderate",
    "showDepChain": true,
    "vulnerabilityFixStrategy": "highest"
  },
  "peerDependencies": {
    "strategy": "strict"
  },
  "mandatoryUpdates": {
    "level": "minor",
    "minSeverity": "high"
  },
  "packages": {
    "typescript": { "allowedVersions": "^5" },
    "@types/*": { "enabled": false }
  },
  "rules": [
    { "packageName": "react", "disabledUpdateTypes": "major" }
  ]
}
```

TypeScript, JavaScript, and MJS files use the public helper. Export the config
as `default` (or as `config`):

```ts
import { definePackageWizardConfig } from "package-wizard"

export default definePackageWizardConfig({
  defaults: { enabledUpdateTypes: ["patch", "minor"] },
  packages: { "@types/*": { enabled: false } }
})
```

Native rules use `enabledUpdateTypes` to allow update levels and
`disabledUpdateTypes` to block them. Both accept `patch`, `minor`, `major`,
and `all`; `all` expands to all three concrete update levels. Do not use
Renovate's `matchUpdateTypes` in native files. Native config rejects overlapping allow/block levels,
`enabled: false` combined with `enabledUpdateTypes`, and conflicting exact
selectors. Release-age filtering is disabled unless `minimumReleaseAge` is
configured.

For direct CLI usage from scripts or CI, pass options to
`package-wizard`, for example:

```bash
package-wizard update
package-wizard update --apply
package-wizard audit --min-severity high
package-wizard audit --apply
package-wizard check --level major
package-wizard peer-check
package-wizard update --check-peer-deps
```

Commands that can change files always preview by default. `--apply` writes `package.json`; use it only after reviewing the preview. `--fix` remains a deprecated compatibility alias for `--apply`.

`--check-peer-deps` is an update-only opt-in. It rejects candidate versions
when npm reports incompatible peer dependencies or incompatible Node.js/npm
`engines`. In guided mode, package-wizard asks about this option immediately
after asking which packages to skip.

## Library usage

Import the public helpers into your own TypeScript or JavaScript scripts:

```ts
import {
  checkPeerDependencies,
  checkVulnerabilities,
  hasMandatoryUpdates,
  updatePackageJsonDependencies
} from "package-wizard"

const updates = await updatePackageJsonDependencies({
  cwd: process.cwd(),
  level: "minor",
  dryRun: true
})

const mandatoryCheck = await hasMandatoryUpdates("minor", "high")
const auditReport = await checkVulnerabilities({
  cwd: process.cwd(),
  minSeverity: "high"
})

const peerCheck = await checkPeerDependencies({
  dependencies: { react: "^18.0.0" }
})
```

`checkPeerDependencies` delegates to npm with strict peer and engine checks.
Use `checkProjectPeerDependencies(cwd)` to load the target project's
`package.json` before checking its current dependency set.

For all available options and exit codes, see the [CLI reference](cli-reference.md).
For update policies, audit behavior, and configuration rules, see the
[package overview](package-overview.md).

## Using with NVM

If you manage Node versions with [nvm](https://github.com/nvm-sh/nvm), install
(or link) the package under the Node version used by the consuming project.
Global installs are scoped to the active Node version.

```bash
nvm use
npm install -g package-wizard
```

For local development with `npm link`, switch to the matching Node version
before building and linking:

```bash
cd package-wizard
nvm use
npm run build
npm link

# In the consuming project
nvm use
npm link package-wizard
```
