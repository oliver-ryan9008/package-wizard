import path from "node:path"
import semver from "semver"
import type { PackageJson } from "type-fest"
import { startSpinner } from "../logging-utils/spinner"
import {
  DEPENDENCY_SECTIONS,
  NpmAuditReport,
  Vulnerability,
  VulnerabilityCheckOptions,
  VulnerabilityCheckResult,
  VulnerabilityFixChange,
  VulnerabilityFixOptions,
  VulnerabilityFixResult,
  VulnerabilityFixSkip,
  VulnerabilitySeverity,
  VULNERABILITY_SEVERITY_RANK
} from "../types"
import {
  execFileAsync,
  readPackageJson,
  readDependencyConfig,
  writePackageJsonAtomically
} from "./file-utils"
import {
  getDependencyRecord,
  getOrCreateStringRecord,
  getUpdateType,
  isRecord,
  isVulnerabilitySeverity,
  stdoutToString
} from "./generic-utils"
import { getPackageMetadata, parseSupportedSpec } from "./package-utils"
import {
  isPackageIgnoredOrDisabledByConfig,
  isUpdateDisabledByConfig,
  isVersionAllowedByConfig,
  shouldUpdatePinnedDependencyByConfig
} from "./renovate-utils"
import { logTiming } from "./timing-utils"

export const runNpmAudit = async (cwd: string): Promise<NpmAuditReport> => {
  try {
    const { stdout } = await execFileAsync("npm", ["audit", "--json"], {
      cwd,
      maxBuffer: 1024 * 1024 * 20
    })

    const report = JSON.parse(stdoutToString(stdout).trim()) as NpmAuditReport
    return {
      auditReportVersion: report.auditReportVersion ?? 2,
      vulnerabilities: report.vulnerabilities ?? {}
    }
  } catch (err: unknown) {
    if (isRecord(err) && "stdout" in err) {
      const stdout = err["stdout"]

      if (typeof stdout === "string" || Buffer.isBuffer(stdout)) {
        const rawOutput = stdoutToString(stdout).trim()

        if (rawOutput.length > 0) {
          const report = JSON.parse(rawOutput) as NpmAuditReport
          return {
            auditReportVersion: report.auditReportVersion ?? 2,
            vulnerabilities: report.vulnerabilities ?? {}
          }
        }
      }
    }

    throw err
  }
}

export const getDependencyChain = async (
  packageName: string,
  cwd: string
): Promise<string | null> => {
  try {
    const result = await execFileAsync("npm", ["list", packageName], {
      cwd
    })
    const output = result.stdout.toString().trim()

    const lines = output.split("\n")
    if (lines.length < 2) {
      return null
    }

    const chainLines = lines.slice(1).filter(line => line.trim().length > 0)
    if (chainLines.length === 0) {
      return null
    }

    const cleanedLines = chainLines
      .map(line => line.replace(/^[\s├└│─┬┴┼→→]*/, "").trim())
      .filter(line => !line.includes("deduped"))

    return cleanedLines.join(" → \n      ")
  } catch {
    return null
  }
}

const normalizeVulnerability = (
  value: unknown,
  minScore: number
): Vulnerability | null => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("severity" in value) ||
    !("name" in value)
  ) {
    return null
  }

  const record = value as Record<string, unknown>
  const severity = record.severity as VulnerabilitySeverity
  if (
    !isVulnerabilitySeverity(severity) ||
    VULNERABILITY_SEVERITY_RANK[severity] < minScore
  ) {
    return null
  }

  const titles = (Array.isArray(record.via) ? record.via : []).flatMap(
    entry => {
      if (typeof entry === "string") {
        return []
      }
      const title =
        typeof entry === "object" && entry !== null && "title" in entry
          ? (entry as Record<string, unknown>).title
          : undefined
      return typeof title === "string" && title.length > 0 ? [title] : []
    }
  )

  const fixValue = record.fixAvailable
  const fixRecord =
    typeof fixValue === "object" && fixValue !== null
      ? (fixValue as Record<string, unknown>)
      : null
  const fixAvailable =
    fixRecord !== null &&
    "name" in fixRecord &&
    "version" in fixRecord &&
    String(fixRecord.name ?? "").length > 0 &&
    String(fixRecord.version ?? "").length > 0
      ? {
          name: String(fixRecord.name),
          version: String(fixRecord.version),
          isSemVerMajor: Boolean(fixRecord.isSemVerMajor)
        }
      : false

  return {
    name: String(record.name ?? ""),
    severity,
    isDirect: Boolean(record.isDirect),
    range: String(record.range ?? ""),
    titles,
    fixAvailable
  }
}

const resolveAuditFixVersion = async (
  vulnerability: Vulnerability,
  strategy: "lowest" | "highest",
  cwd: string
): Promise<string> => {
  const auditFix = vulnerability.fixAvailable
  if (auditFix === false || strategy !== "highest") {
    return auditFix === false ? "" : auditFix.version
  }

  try {
    const metadata = await getPackageMetadata(
      auditFix.name ?? vulnerability.name,
      cwd
    )
    const highestVersion = metadata.versions
      .map(version => semver.parse(version))
      .filter(
        (version): version is semver.SemVer =>
          version !== null &&
          version.prerelease.length === 0 &&
          semver.gte(version, auditFix.version)
      )
      .sort(semver.rcompare)[0]

    return highestVersion?.version ?? auditFix.version
  } catch {
    return auditFix.version
  }
}

type DependencyMap = Map<
  string,
  { section: (typeof DEPENDENCY_SECTIONS)[number]; spec: string }
>

const addDirectVulnerabilityFix = (
  vuln: Vulnerability,
  fixVersion: string,
  packageJson: PackageJson,
  dependencyConfig: Awaited<ReturnType<typeof readDependencyConfig>>,
  directDependencies: DependencyMap,
  fixed: VulnerabilityFixChange[],
  skipped: VulnerabilityFixSkip[],
  fixedPackageNames: Set<string>
): void => {
  const directDependency = directDependencies.get(vuln.name)
  if (!directDependency) {
    skipped.push({
      name: vuln.name,
      reason: "Package not found in any dependency section"
    })
    return
  }

  const { section, spec: currentSpec } = directDependency
  const sectionDeps = getDependencyRecord(packageJson, section)
  if (sectionDeps === null) return

  if (semver.satisfies(fixVersion, currentSpec)) {
    skipped.push({
      name: vuln.name,
      reason: "Current spec already covers fix version"
    })
    return
  }

  const parsed = parseSupportedSpec(currentSpec)
  const currentVersion = parsed?.version ?? semver.coerce(currentSpec)
  const fixSemVer = semver.parse(fixVersion)
  const packageDisabled = isPackageIgnoredOrDisabledByConfig(
    dependencyConfig,
    vuln.name,
    section
  )

  const blocked =
    !isVersionAllowedByConfig(
      dependencyConfig,
      vuln.name,
      fixVersion,
      section
    ) ||
    (parsed?.prefix === "" &&
      !shouldUpdatePinnedDependencyByConfig(
        dependencyConfig,
        vuln.name,
        section
      ))
  if (blocked) {
    skipped.push({
      name: vuln.name,
      reason: "Blocked by configured version policy"
    })
    return
  }

  if (currentVersion !== null && semver.lt(fixVersion, currentVersion)) {
    skipped.push({
      name: vuln.name,
      reason: `Fix version ${vuln.name}@${fixVersion} is older than current ${currentVersion.version} — skipping to avoid downgrade`
    })
    return
  }

  if (
    currentVersion !== null &&
    fixSemVer !== null &&
    (packageDisabled ||
      isUpdateDisabledByConfig(
        dependencyConfig,
        vuln.name,
        getUpdateType(currentVersion, fixSemVer),
        section
      ))
  ) {
    skipped.push({
      name: vuln.name,
      reason: "Disabled by configured dependency rules"
    })
    return
  }

  if (packageDisabled) {
    skipped.push({
      name: vuln.name,
      reason: "Disabled by configured dependency rules"
    })
    return
  }

  const newSpec = parsed === null ? fixVersion : `${parsed.prefix}${fixVersion}`
  sectionDeps[vuln.name] = newSpec
  packageJson[section] = sectionDeps
  directDependencies.set(vuln.name, { section, spec: newSpec })
  fixed.push({
    name: vuln.name,
    from: currentSpec,
    to: newSpec,
    method: "direct",
    section
  })
  fixedPackageNames.add(vuln.name)
}

const addTransitiveVulnerabilityFix = (
  vuln: Vulnerability,
  fixVersion: string,
  packageJson: PackageJson,
  dependencyConfig: Awaited<ReturnType<typeof readDependencyConfig>>,
  directDependencies: DependencyMap,
  fixed: VulnerabilityFixChange[],
  skipped: VulnerabilityFixSkip[],
  fixedPackageNames: Set<string>
): void => {
  const packageToFix =
    vuln.fixAvailable === false
      ? vuln.name
      : (vuln.fixAvailable.name ?? vuln.name)
  const isPackageExcluded = DEPENDENCY_SECTIONS.some(section =>
    isPackageIgnoredOrDisabledByConfig(
      dependencyConfig,
      packageToFix,
      section
    )
  )
  if (isPackageExcluded) {
    skipped.push({
      name: packageToFix,
      reason: "Disabled by configured dependency rules"
    })
    return
  }

  const directDependency = directDependencies.get(packageToFix)
  if (directDependency) {
    const currentVersion = semver.coerce(directDependency.spec)?.version
    if (currentVersion && semver.gt(currentVersion, fixVersion)) {
      skipped.push({
        name: vuln.name,
        reason: `Fix version ${packageToFix}@${fixVersion} is older than current ${currentVersion} — skipping to avoid downgrade`
      })
      return
    }

    const fixApproach =
      packageToFix === vuln.name
        ? "direct dependency update"
        : `direct dependency update (${packageToFix})`
    const alreadyFixed = fixedPackageNames.has(packageToFix)
    skipped.push({
      name: vuln.name,
      reason: `Fix applied via ${fixApproach}${alreadyFixed ? " — already applied" : ""}`
    })
    return
  }

  const overrides = getOrCreateStringRecord(packageJson, "overrides")
  const currentOverride = overrides[packageToFix]
  if (
    currentOverride !== undefined &&
    semver.satisfies(fixVersion, currentOverride)
  ) {
    skipped.push({
      name: packageToFix,
      reason: "Existing override already covers fix version"
    })
    return
  }

  overrides[packageToFix] = fixVersion
  packageJson.overrides = overrides
  fixed.push({
    name: packageToFix,
    from: currentOverride ?? "(none)",
    to: fixVersion,
    method: "override"
  })
  fixedPackageNames.add(packageToFix)
}

export const checkVulnerabilities = async (
  options: VulnerabilityCheckOptions = {}
): Promise<VulnerabilityCheckResult> => {
  const operationStartedAt = performance.now()
  const cwd =
    options.cwd === undefined ? process.cwd() : path.resolve(options.cwd)

  const minSeverity = options.minSeverity ?? VulnerabilitySeverity.High
  const minScore = VULNERABILITY_SEVERITY_RANK[minSeverity]

  const spinner = options.quiet
    ? null
    : startSpinner(`Running npm audit (min severity: ${minSeverity})...`)

  try {
    const report = await runNpmAudit(cwd)
    const vulnerabilities: Vulnerability[] = []
    const reportVulnerabilities = report.vulnerabilities ?? {}
    const vulnEntries: unknown[] = []

    for (const value of Object.values(reportVulnerabilities)) {
      if (Array.isArray(value)) {
        vulnEntries.push(...value)
      } else {
        vulnEntries.push(value)
      }
    }

    for (const vuln of vulnEntries) {
      const normalized = normalizeVulnerability(vuln, minScore)
      if (normalized) {
        vulnerabilities.push(normalized)
      }
    }

    if (vulnerabilities.length === 0) {
      spinner?.succeed(`No ${minSeverity}+ audit vulnerabilities found`)
    } else {
      spinner?.fail(
        `Found ${vulnerabilities.length} ${minSeverity}+ audit vulnerabilit${
          vulnerabilities.length === 1 ? "y" : "ies"
        }`
      )
    }

    return {
      vulnerabilities,
      total: vulnerabilities.length
    }
  } catch (error) {
    spinner?.fail("npm audit failed")
    throw error
  } finally {
    logTiming("audit", operationStartedAt)
  }
}

export const fixVulnerabilities = async (
  options: VulnerabilityFixOptions = {}
): Promise<VulnerabilityFixResult> => {
  const cwd =
    options.cwd === undefined ? process.cwd() : path.resolve(options.cwd)
  const dryRun = options.dryRun ?? false

  const packageJsonPath = path.join(cwd, "package.json")
  const packageJson = await readPackageJson(packageJsonPath, {
    quiet: options.quiet
  })
  const dependencyConfig = options.dependencyConfig !== undefined
    ? options.dependencyConfig
    : await readDependencyConfig(cwd, { log: options.configLog })
  const configuredAudit = dependencyConfig?.audit
  const vulnerabilityFixStrategy =
    options.vulnerabilityFixStrategy ??
    configuredAudit?.vulnerabilityFixStrategy ??
    dependencyConfig?.vulnerabilityAlerts?.vulnerabilityFixStrategy ??
    "lowest"

  const checkOptions: VulnerabilityCheckOptions = {
    cwd,
    ...(options.minSeverity === undefined && configuredAudit?.minSeverity === undefined
      ? {}
      : { minSeverity: options.minSeverity ?? configuredAudit?.minSeverity }),
    quiet: options.quiet
  }

  const { vulnerabilities } = await checkVulnerabilities(checkOptions)
  const directDependencies: DependencyMap = new Map()

  for (const section of DEPENDENCY_SECTIONS) {
    const sectionDeps = getDependencyRecord(packageJson, section)
    if (sectionDeps === null) {
      continue
    }

    for (const [name, spec] of Object.entries(sectionDeps)) {
      directDependencies.set(name, { section, spec })
    }
  }

  const fixed: VulnerabilityFixChange[] = []
  const skipped: VulnerabilityFixSkip[] = []
  const fixedPackageNames = new Set<string>()

  for (const vuln of vulnerabilities) {
    if (vuln.fixAvailable === false) {
      skipped.push({
        name: vuln.name,
        reason: "No fix available from npm audit"
      })
      continue
    }

    const fixVersion = await resolveAuditFixVersion(
      vuln,
      vulnerabilityFixStrategy,
      cwd
    )

    if (vuln.isDirect) {
      addDirectVulnerabilityFix(
        vuln,
        fixVersion,
        packageJson,
        dependencyConfig,
        directDependencies,
        fixed,
        skipped,
        fixedPackageNames
      )
    } else {
      addTransitiveVulnerabilityFix(
        vuln,
        fixVersion,
        packageJson,
        dependencyConfig,
        directDependencies,
        fixed,
        skipped,
        fixedPackageNames
      )
    }
  }

  if (!dryRun && fixed.length > 0) {
    await writePackageJsonAtomically(packageJsonPath, packageJson)
  }

  return {
    packageJsonPath,
    vulnerabilities,
    fixed,
    skipped
  }
}
