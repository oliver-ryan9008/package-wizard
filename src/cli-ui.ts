import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import semver from "semver"
import { getCommandDefinition } from "./cli-definition"
import {
  CliCommand,
  CliOptions,
  DependencySection,
  MandatoryUpdateCheckResult,
  PackageChange,
  SkipInfo,
  UpdateResult,
  Vulnerability,
  VulnerabilityFixResult,
  VulnerabilitySeverity,
  VULNERABILITY_SEVERITY_RANK
} from "./types"
import { getUpdateType } from "./utils/generic-utils"
import {
  errorBanner,
  errorLogger,
  formatColumns,
  generalLogger,
  infoLogger,
  successBanner,
  successLogger,
  warnLogger
} from "./logging-utils/logger"

const sectionLabels: Record<DependencySection, string> = {
  dependencies: "Production dependencies",
  devDependencies: "Development dependencies",
  optionalDependencies: "Optional dependencies",
  peerDependencies: "Peer dependencies"
}

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`

const displayTargetPath = (cwd?: string): string => {
  const packageJsonPath = path.join(cwd ?? process.cwd(), "package.json")
  const homeDirectory = process.env.HOME

  if (!homeDirectory) {
    return packageJsonPath
  }

  const relativePath = path.relative(homeDirectory, packageJsonPath)
  return relativePath && !relativePath.startsWith("..")
    ? `~/${relativePath}`
    : packageJsonPath
}

const updateKind = (change: PackageChange): string => {
  const from = semver.coerce(change.from)
  const to = semver.coerce(change.to)

  if (!from || !to) {
    return "version change"
  }

  return getUpdateType(from, to)
}

const printChanges = (changes: readonly PackageChange[]): void => {
  const bySection = new Map<DependencySection, PackageChange[]>()

  for (const change of changes) {
    const sectionChanges = bySection.get(change.section) ?? []
    sectionChanges.push(change)
    bySection.set(change.section, sectionChanges)
  }

  for (const [section, sectionChanges] of bySection) {
    infoLogger(`${sectionLabels[section]} (${sectionChanges.length})`)
    generalLogger(
      formatColumns(
        sectionChanges.map(change => ({
          label: change.name,
          description: `${change.from} -> ${change.to} (${updateKind(change)})`
        }))
      )
    )
  }
}

const collectSkippedUpdates = (result: UpdateResult): SkipInfo[] => [
  ...result.skipped,
  ...result.renovateExcluded,
  ...(result.releaseAgeWarnings ?? []),
  ...(result.releaseAgeErrors ?? [])
]

const printSkippedUpdates = (result: UpdateResult, verbose: boolean): void => {
  const skipped = collectSkippedUpdates(result)

  if (skipped.length === 0) {
    return
  }

  if (!verbose) {
    infoLogger(`${pluralize(skipped.length, "package")} skipped.`)
    return
  }

  infoLogger(`Skipped packages (${skipped.length})`)
  generalLogger(
    formatColumns(
      skipped.map(item => ({
        label: `${item.section} ${item.name}`,
        description: item.reason
      }))
    )
  )
}

const detectPackageManager = (cwd?: string): string => {
  const targetDirectory = cwd ?? process.cwd()
  const packageJsonPath = path.join(targetDirectory, "package.json")
  let configuredManager: unknown

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      packageManager?: unknown
    }
    configuredManager = packageJson.packageManager
  } catch {
    configuredManager = undefined
  }

  if (typeof configuredManager === "string") {
    if (configuredManager.startsWith("pnpm@")) return "pnpm"
    if (configuredManager.startsWith("yarn@")) return "yarn"
    if (configuredManager.startsWith("bun@")) return "bun"
    if (configuredManager.startsWith("npm@")) return "npm"
  }

  const lockfiles: ReadonlyArray<[string, string]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
    ["npm-shrinkwrap.json", "npm"]
  ]

  return (
    lockfiles.find(([lockfile]) =>
      existsSync(path.join(targetDirectory, lockfile))
    )?.[1] ?? "npm"
  )
}

export const getInstallCommand = (cwd?: string): string =>
  `${detectPackageManager(cwd)} install`

export const printOperationHeader = (
  version: string,
  command: CliCommand,
  options: CliOptions
): void => {
  const definition = getCommandDefinition(command)
  successLogger(`Package Wizard v${version}`)
  infoLogger(`Target: ${displayTargetPath(options.cwd)}`)

  const mode = definition.supportsApply
    ? options.dryRun
      ? "Preview: no files will change"
      : "Apply: package.json may change"
    : "Read-only policy check"

  generalLogger(`${definition.label} | ${mode}`)
  generalLogger("")
}

export const printUpdateResult = (
  result: UpdateResult,
  options: CliOptions
): number => {
  const skippedCount = collectSkippedUpdates(result).length
  const changeCount = result.updated.length

  infoLogger(
    `Scan complete: ${pluralize(changeCount, "change")}, ${pluralize(skippedCount, "package")} skipped.`
  )

  if (changeCount > 0) {
    generalLogger("")
    printChanges(result.updated)
  } else {
    successLogger("No eligible updates found.")
  }

  if (result.releaseAgeErrors && result.releaseAgeErrors.length > 0) {
    errorLogger(
      `${pluralize(result.releaseAgeErrors.length, "package")} do not satisfy the configured minimum release age.`
    )
  }

  if (skippedCount > 0) {
    generalLogger("")
    printSkippedUpdates(result, options.verbose ?? false)
  }

  if (options.dryRun) {
    successBanner("Preview complete. package.json was not modified.")
    return changeCount
  }

  successLogger(`package.json updated. Run ${getInstallCommand(options.cwd)}.`)
  successBanner("Changes applied.")
  return changeCount
}

const vulnerabilityLabel = (vulnerability: Vulnerability): string => {
  const source = vulnerability.isDirect ? "direct" : "indirect"
  return `[${vulnerability.severity.toUpperCase()}] ${vulnerability.name} (${source})`
}

const vulnerabilityDescription = (vulnerability: Vulnerability): string => {
  const title = vulnerability.titles[0]
  const fix = vulnerability.fixAvailable
    ? `fix: ${vulnerability.fixAvailable.version}`
    : "fix: unavailable"
  const titlePrefix = title ? `${title}. ` : ""
  const dependencyChain = vulnerability.dependencyChain
    ? ` Dependency chain: ${vulnerability.dependencyChain
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .join(" -> ")}`
    : ""

  return `${titlePrefix}Vulnerable range: ${vulnerability.range}; ${fix}.${dependencyChain}`
}

const printVulnerabilities = (
  vulnerabilities: readonly Vulnerability[]
): void => {
  if (vulnerabilities.length === 0) {
    successLogger("No vulnerabilities found at selected severity.")
    return
  }

  const highSeverityCount = vulnerabilities.filter(
    vulnerability =>
      VULNERABILITY_SEVERITY_RANK[vulnerability.severity] >=
      VULNERABILITY_SEVERITY_RANK[VulnerabilitySeverity.High]
  ).length

  if (highSeverityCount > 0) {
    warnLogger(
      `${pluralize(highSeverityCount, "high-severity vulnerability", "high-severity vulnerabilities")} need attention.`
    )
  }

  generalLogger(
    formatColumns(
      vulnerabilities.map(vulnerability => ({
        label: vulnerabilityLabel(vulnerability),
        description: vulnerabilityDescription(vulnerability)
      }))
    )
  )
}

export const printAuditResult = (
  result: VulnerabilityFixResult,
  options: CliOptions
): number => {
  const changeCount = result.fixed.length
  const action = options.dryRun ? "ready for review" : "applied"

  infoLogger(
    `Audit complete: ${pluralize(result.vulnerabilities.length, "vulnerability")}, ${pluralize(changeCount, "fix")} ${action}.`
  )
  generalLogger("")
  printVulnerabilities(result.vulnerabilities)

  if (result.fixed.length > 0) {
    generalLogger("")
    infoLogger(
      `${options.dryRun ? "Planned" : "Applied"} fixes (${result.fixed.length})`
    )
    generalLogger(
      formatColumns(
        result.fixed.map(fix => ({
          label: fix.name,
          description: `${fix.from} -> ${fix.to}${fix.method === "override" ? " (override)" : ""}`
        }))
      )
    )
  }

  if (result.skipped.length > 0) {
    generalLogger("")
    if (options.verbose) {
      infoLogger(`Unavailable or skipped fixes (${result.skipped.length})`)
      generalLogger(
        formatColumns(
          result.skipped.map(item => ({
            label: item.name,
            description: item.reason
          }))
        )
      )
    } else {
      infoLogger(
        `${pluralize(result.skipped.length, "fix")} unavailable or skipped.`
      )
    }
  }

  if (options.dryRun) {
    successBanner("Preview complete. package.json was not modified.")
    return changeCount
  }

  successLogger(`package.json updated. Run ${getInstallCommand(options.cwd)}.`)
  successBanner("Changes applied.")
  return changeCount
}

export const printMandatoryCheckResult = (
  result: MandatoryUpdateCheckResult
): void => {
  if (!result.hasMandatoryUpdates) {
    successLogger("Maintenance check passed.")
    generalLogger(`  ${result.message}`)
    successBanner("No action required.")
    return
  }

  errorLogger("Maintenance check failed.")
  generalLogger(`  ${result.message}`)

  if (result.updated && result.updated.length > 0) {
    generalLogger("")
    infoLogger(`Required updates (${result.updated.length})`)
    printChanges(result.updated)
  }

  if (result.vulnerabilities && result.vulnerabilities.length > 0) {
    generalLogger("")
    infoLogger(`Policy vulnerabilities (${result.vulnerabilities.length})`)
    printVulnerabilities(result.vulnerabilities)
  }

  errorBanner("Maintenance required. Exit code: 2.")
}

const completionScripts: Record<string, string> = {
  bash: [
    "_package_wizard() {",
    '  local current="${COMP_WORDS[COMP_CWORD]}"',
    '  local commands="update audit check pin about completion help"',
    '  local options="--cwd --level --skip --min-severity --dry-run --apply --fix --json --verbose --color --no-color --show-dep-chain --no-update --help --version"',
    '  COMPREPLY=( $(compgen -W "${commands} ${options}" -- "${current}") )',
    "}",
    "complete -F _package_wizard package-wizard"
  ].join("\n"),
  zsh: [
    "#compdef package-wizard",
    "_package_wizard() {",
    "  _arguments -C \\",
    "    '1:command:(update audit check pin about completion help)' \\",
    "    '--cwd[Target directory]:path:_files' \\",
    "    '--level[Maximum update level]:(patch minor major)' \\",
    "    '--min-severity[Minimum audit severity]:(critical high moderate low info)' \\",
    "    '--skip[Packages to skip]:package' \\",
    "    '--color[Color mode]:(auto always never)' \\",
    "    '(-n --dry-run)'{-n,--dry-run}[Preview changes]' \\",
    "    '(-y --apply)'{-y,--apply}[Apply changes]' \\",
    "    '(-v --verbose)'{-v,--verbose}[Show skipped reasons]' \\",
    "    '--json[Write JSON result]' \\",
    "    '--no-update[Pin current versions only]' \\",
    "    '--show-dep-chain[Show indirect dependency chains]' \\",
    "    '(-h --help)'{-h,--help}[Show help]' \\",
    "    '(-V --version)'{-V,--version}[Show version]'",
    "}",
    '_package_wizard "$@"'
  ].join("\n"),
  fish: [
    "complete -c package-wizard -f",
    "complete -c package-wizard -n '__fish_use_subcommand' -a update -d 'Preview dependency updates'",
    "complete -c package-wizard -n '__fish_use_subcommand' -a audit -d 'Review security vulnerabilities'",
    "complete -c package-wizard -n '__fish_use_subcommand' -a check -d 'Check maintenance policy'",
    "complete -c package-wizard -n '__fish_use_subcommand' -a pin -d 'Pin Versions'",
    "complete -c package-wizard -l cwd -r -d 'Target directory'",
    "complete -c package-wizard -l level -r -a 'patch minor major' -d 'Maximum update level'",
    "complete -c package-wizard -l min-severity -r -a 'critical high moderate low info' -d 'Minimum audit severity'",
    "complete -c package-wizard -s n -l dry-run -d 'Preview changes'",
    "complete -c package-wizard -s y -l apply -d 'Apply changes'",
    "complete -c package-wizard -s v -l verbose -d 'Show skipped reasons'",
    "complete -c package-wizard -l json -d 'Write JSON result'",
    "complete -c package-wizard -s h -l help -d 'Show help'"
  ].join("\n")
}

export const printShellCompletion = (shell: string): void => {
  const completion = completionScripts[shell]

  if (!completion) {
    throw new Error("completion shell must be one of: bash, zsh, fish")
  }

  process.stdout.write(`${completion}\n`)
}
