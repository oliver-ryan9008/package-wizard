import path from "node:path"
import semver from "semver"
import type { PackageJson } from "type-fest"
import { startSpinner } from "../logging-utils/spinner"
import {
  DEPENDENCY_SECTIONS,
  MandatoryUpdateCheckResult,
  PackageChange,
  SkipInfo,
  UpdateOptions,
  UpdateResult,
  UpdateLevel,
  Vulnerability,
  VulnerabilitySeverity,
  UPDATE_LEVEL_RANK
} from "../types"
import {
  readPackageJson,
  readDependencyConfig,
  writePackageJsonAtomically
} from "./file-utils"
import { checkVulnerabilities, fixVulnerabilities } from "./audit-utils"
import { getDependencyRecord, getUpdateType } from "./generic-utils"
import {
  filterVersionsByReleaseAge,
  getCandidateVersions,
  getPackageMetadata,
  getUnsupportedSpecReason,
  PackageMetadata,
  parseMinimumReleaseAge,
  parseSupportedSpec,
  TargetUpdate
} from "./package-utils"
import {
  isPackageIgnoredOrDisabledByConfig,
  isVersionAllowedByConfig,
  shouldIgnoreUnstableByConfig,
  shouldRespectLatestByConfig,
  shouldSkipUpdate,
  shouldUpdatePinnedDependencyByConfig
} from "./renovate-utils"
import { logTiming } from "./timing-utils"
import { checkPeerDependencies } from "./peer-utils"

interface DependencyTarget {
  section: (typeof DEPENDENCY_SECTIONS)[number]
  name: string
  currentSpec: string
  parsed: ReturnType<typeof parseSupportedSpec>
  disabled: boolean
}

interface UpdateTargetContext {
  packageJson: PackageJson
  dependencyConfig: Awaited<ReturnType<typeof readDependencyConfig>>
  metadataCache: Map<string, Promise<PackageMetadata>>
  cwd: string
  level: UpdateLevel
  pin: boolean
  noUpdate: boolean
  skip: Set<string>
  minimumReleaseAge: string | number | false
  minimumReleaseAgeBehavior: "timestamp-required" | "timestamp-optional"
  minimumAge: number
  now: number
  allPackages: string[]
  processedPackageCount: number
  spinner: ReturnType<typeof startSpinner> | null
  updated: PackageChange[]
  skipped: SkipInfo[]
  configExcluded: SkipInfo[]
  releaseAgeWarnings: SkipInfo[]
  releaseAgeErrors: SkipInfo[]
  peerStrategy: "ignore" | "strict"
}

const getCachedPackageMetadata = (
  packageName: string,
  cwd: string,
  cache: Map<string, Promise<PackageMetadata>>
): Promise<PackageMetadata> => {
  const cached = cache.get(packageName)
  if (cached) {
    return cached
  }

  const metadata = getPackageMetadata(packageName, cwd)
  cache.set(packageName, metadata)
  return metadata
}

const prefetchPackageMetadata = async (
  packageNames: string[],
  cwd: string,
  cache: Map<string, Promise<PackageMetadata>>,
  onPackageStart?: (packageName: string, index: number, total: number) => void
): Promise<void> => {
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < packageNames.length) {
      const packageIndex = nextIndex
      const packageName = packageNames[packageIndex]
      nextIndex += 1

      if (packageName === undefined) {
        continue
      }

      onPackageStart?.(packageName, packageIndex, packageNames.length)
      await getCachedPackageMetadata(packageName, cwd, cache).catch(
        () => undefined
      )
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(4, packageNames.length) }, () => worker())
  )
}

const processUpdateTarget = async (
  target: DependencyTarget,
  context: UpdateTargetContext
): Promise<void> => {
  const {
    packageJson,
    dependencyConfig,
    metadataCache,
    cwd,
    level,
    pin,
    noUpdate,
    skip,
    minimumReleaseAge,
    minimumReleaseAgeBehavior,
    minimumAge,
    now,
    allPackages,
    spinner,
    updated,
    skipped,
    configExcluded,
    releaseAgeWarnings,
    releaseAgeErrors
    , peerStrategy
  } = context
  const { section, name, currentSpec, parsed, disabled } = target
  const sectionDeps = getDependencyRecord(packageJson, section)
  if (sectionDeps === null) return

  if (spinner) {
    spinner.text = `Checking package ${context.processedPackageCount}/${allPackages.length}: ${name}`
  }

  if (skip.has(name)) {
    skipped.push({ section, name, reason: "Skipped via --skip" })
    return
  }
  if (parsed === null) {
    skipped.push({
      section,
      name,
      reason: getUnsupportedSpecReason(currentSpec)
    })
    return
  }
  if (disabled) {
    configExcluded.push({
      section,
      name,
      reason: "Disabled by configured dependency rules"
    })
    return
  }
  if (noUpdate) {
    if (!pin) {
      skipped.push({ section, name, reason: "--no-update requires --pin" })
    } else if (parsed.prefix === "") {
      skipped.push({ section, name, reason: "Already pinned" })
    } else {
      const nextSpec = parsed.version.version
      sectionDeps[name] = nextSpec
      packageJson[section] = sectionDeps
      updated.push({ section, name, from: currentSpec, to: nextSpec })
    }
    return
  }

  if (
    parsed.prefix === "" &&
    !shouldUpdatePinnedDependencyByConfig(dependencyConfig, name, section)
  ) {
    skipped.push({
      section,
      name,
      reason: "Pinned dependency updates disabled by configured rules"
    })
    return
  }

  let metadata: PackageMetadata
  try {
    metadata = await getCachedPackageMetadata(name, cwd, metadataCache)
  } catch {
    skipped.push({ section, name, reason: "Failed to fetch package versions" })
    return
  }

  const ignoreUnstable = shouldIgnoreUnstableByConfig(
    dependencyConfig,
    name,
    section
  )
  const respectLatest = shouldRespectLatestByConfig(
    dependencyConfig,
    name,
    section
  )
  const isAtOrBelowLatest = (version: semver.SemVer) =>
    !respectLatest ||
    metadata.latestVersion === undefined ||
    semver.lte(version, metadata.latestVersion)
  const candidatesBeforeReleaseAge = getCandidateVersions(
    metadata.versions,
    parsed.version,
    level,
    ignoreUnstable
  ).filter(isAtOrBelowLatest)
  const ageEligibleVersions = filterVersionsByReleaseAge(
    metadata.versions,
    metadata.releaseTimes,
    minimumReleaseAge,
    now,
    minimumReleaseAgeBehavior
  )
  const candidateVersions = getCandidateVersions(
    ageEligibleVersions,
    parsed.version,
    level,
    ignoreUnstable
  ).filter(isAtOrBelowLatest)

  const currentReleaseTimestamp = Date.parse(
    metadata.releaseTimes[parsed.version.version] ?? ""
  )
  if (
    Number.isFinite(currentReleaseTimestamp) &&
    currentReleaseTimestamp > now - minimumAge
  ) {
    releaseAgeErrors.push({
      section,
      name,
      reason: `Current version [${parsed.version.version}]`
    })
  }
  const ageEligibleVersionSet = new Set(ageEligibleVersions)
  const ageBlockedVersions = candidatesBeforeReleaseAge
    .filter(candidate => !ageEligibleVersionSet.has(candidate.version))
    .map(candidate => candidate.version)
  if (ageBlockedVersions.length > 0) {
    releaseAgeWarnings.push({
      section,
      name,
      reason: `Skipped [${ageBlockedVersions.sort(semver.compare).join(", ")}]`
    })
  }
  if (candidateVersions.length === 0) {
    skipped.push({
      section,
      name,
      reason:
        candidatesBeforeReleaseAge.length > 0
          ? `No update recommended: available releases are newer than the minimum release age (${String(minimumReleaseAge)}).`
          : "No eligible update found"
    })
    return
  }

  let targetUpdate: TargetUpdate | null = null
  let peerConflict = false
  for (const candidateVersion of candidateVersions) {
      const updateType = getUpdateType(parsed.version, candidateVersion)
      if (
        !isVersionAllowedByConfig(
          dependencyConfig,
          name,
          candidateVersion.version,
          section
        ) ||
        shouldSkipUpdate(dependencyConfig, name, updateType, level, section)
      ) {
        continue
      }
      if (peerStrategy === "strict") {
        const candidatePackageJson = structuredClone(packageJson)
        const candidateDependencies = getDependencyRecord(
          candidatePackageJson,
          section
        )
        if (candidateDependencies === null) continue
        candidateDependencies[name] = `${parsed.prefix}${candidateVersion.version}`
        candidatePackageJson[section] = candidateDependencies
        if (spinner) {
          spinner.text = `Checking peer deps and node engines for ${name}`
        }
        const peerResult = await checkPeerDependencies(candidatePackageJson, {
          quiet: true
        })
        if (!peerResult.valid) {
          peerConflict = true
          continue
        }
      }
      targetUpdate = { version: candidateVersion.version, updateType }
      break
  }
  if (targetUpdate === null) {
    configExcluded.push({
      section,
      name,
      reason: peerConflict
        ? "No eligible update satisfies peer dependencies"
        : "No eligible update allowed by configured rules"
    })
    return
  }

  const nextVersion = targetUpdate.version
  const nextSpec = pin ? nextVersion : `${parsed.prefix}${nextVersion}`
  if (nextSpec === currentSpec) {
    skipped.push({
      section,
      name,
      reason: "Already at latest eligible version"
    })
    return
  }
  sectionDeps[name] = nextSpec
  packageJson[section] = sectionDeps
  updated.push({ section, name, from: currentSpec, to: nextSpec })
}

export const updatePackageJsonDependencies = async (
  options: UpdateOptions = {}
): Promise<UpdateResult> => {
  const operationStartedAt = performance.now()
  const cwd =
    options.cwd === undefined ? process.cwd() : path.resolve(options.cwd)
  const level = options.level ?? UpdateLevel.Minor
  const dryRun = options.dryRun ?? false
  const pin = options.pin ?? false
  const noUpdate = options.noUpdate ?? false
  const skip = new Set(options.skip ?? [])

  const packageJsonPath = path.join(cwd, "package.json")
  const packageJson = await readPackageJson(packageJsonPath, {
    quiet: options.quiet
  })
  const dependencyConfig = options.dependencyConfig !== undefined
    ? options.dependencyConfig
    : await readDependencyConfig(cwd, { log: options.configLog })
  const updated: PackageChange[] = []
  const skipped: SkipInfo[] = []
  const configExcluded: SkipInfo[] = []
  const releaseAgeWarnings: SkipInfo[] = []
  const releaseAgeErrors: SkipInfo[] = []

  const dependencyTargets: DependencyTarget[] = DEPENDENCY_SECTIONS.flatMap(
    section => {
      const deps = getDependencyRecord(packageJson, section)
      if (deps === null) {
        return []
      }

      return Object.entries(deps).map(([name, currentSpec]) => ({
        section,
        name,
        currentSpec,
        parsed: parseSupportedSpec(currentSpec),
        disabled: isPackageIgnoredOrDisabledByConfig(
          dependencyConfig,
          name,
          section
        )
      }))
    }
  )
  const allPackages = dependencyTargets.map(target => target.name)
  const minimumReleaseAge = dependencyConfig?.minimumReleaseAge ?? false
  const minimumReleaseAgeBehavior =
    dependencyConfig?.minimumReleaseAgeBehavior ?? "timestamp-optional"
  const minimumAge = parseMinimumReleaseAge(minimumReleaseAge)
  const now = Date.now()
  const spinner = options.quiet
    ? null
    : startSpinner(`Checking ${allPackages.length} package(s) for updates...`)
  const metadataCache = new Map<string, Promise<PackageMetadata>>()

  if (!noUpdate) {
    const metadataStartedAt = performance.now()
    const eligiblePackageNames = dependencyTargets
      .filter(
        target =>
          !skip.has(target.name) && target.parsed !== null && !target.disabled
      )
      .map(target => target.name)

    await prefetchPackageMetadata(
      eligiblePackageNames,
      cwd,
      metadataCache,
      spinner
        ? (packageName, packageIndex, packageCount) => {
            spinner.text = `Checking package ${packageIndex + 1}/${packageCount}: ${packageName}`
          }
        : undefined
    )
    logTiming("metadata-prefetch", metadataStartedAt)
  }

  let processedPackageCount = 0

  try {
    for (const target of dependencyTargets) {
      processedPackageCount += 1
      await processUpdateTarget(target, {
        packageJson,
        dependencyConfig: dependencyConfig,
        metadataCache,
        cwd,
        level,
        pin,
        noUpdate,
        skip,
        minimumReleaseAge,
        minimumReleaseAgeBehavior,
        minimumAge,
        now,
        allPackages,
        processedPackageCount,
        spinner,
        updated,
        skipped,
        configExcluded,
        releaseAgeWarnings,
        releaseAgeErrors,
        peerStrategy: dependencyConfig?.peerDependencies?.strategy ?? "ignore"
      })
    }

    if (!dryRun && updated.length > 0) {
      if (spinner) {
        spinner.text = "Writing package.json updates..."
      }
      await writePackageJsonAtomically(packageJsonPath, packageJson)
    }

    if (updated.length === 0) {
      spinner?.succeed(
        `Checked ${allPackages.length} package(s); no updates applied\n`
      )
    } else if (dryRun) {
      spinner?.succeed(
        `Checked ${allPackages.length} package(s); ${updated.length} update(s) would be applied\n`
      )
    } else {
      spinner?.succeed(
        `Checked ${allPackages.length} package(s); applied ${updated.length} update(s)\n`
      )
    }

    return {
      packageJsonPath,
      updated,
      skipped,
      configExcluded: configExcluded,
      releaseAgeWarnings,
      releaseAgeErrors,
      minimumReleaseAge: dependencyConfig?.minimumReleaseAge ?? false
    }
  } catch (error) {
    spinner?.fail("Package update scan failed")
    throw error
  } finally {
    logTiming("update", operationStartedAt)
  }
}

export const getErrorMessageForMandatoryUpdates = (
  requiredUpdateLevel: UpdateLevel,
  updateCount = 0,
  vulnerabilityCount = 0
) => {
  const reasons: string[] = []

  if (updateCount > 0) {
    reasons.push(
      `${updateCount} dependency update(s) at or above "${requiredUpdateLevel}"`
    )
  }

  if (vulnerabilityCount > 0) {
    reasons.push(
      `${vulnerabilityCount} audit vulnerabilit${
        vulnerabilityCount === 1 ? "y" : "ies"
      }`
    )
  }

  return `Error: Mandatory dependency maintenance required: ${reasons.join(
    " and "
  )}. Please update your dependencies or resolve audit vulnerabilities.`
}

export const getPassedMessageForMandatoryUpdates = (
  requiredUpdateLevel: UpdateLevel
) => {
  return `No mandatory updates found for your project's configured update level '${requiredUpdateLevel}', and no audit vulnerabilities were found.`
}

export const hasMandatoryUpdates = async (
  level: UpdateLevel,
  auditCheckLevel?: VulnerabilitySeverity,
  overrideOptions: UpdateOptions = {}
): Promise<MandatoryUpdateCheckResult> => {
  if (!Object.values(UpdateLevel).includes(level)) {
    throw new Error(`Invalid update level: ${level}`)
  }

  const dependencyConfig = overrideOptions.dependencyConfig !== undefined
    ? overrideOptions.dependencyConfig
    : await readDependencyConfig(overrideOptions.cwd ?? process.cwd(), { log: overrideOptions.configLog })
  const configuredMandatory = dependencyConfig?.mandatoryUpdates
  const effectiveLevel = level === UpdateLevel.Minor && configuredMandatory?.level !== undefined
    ? configuredMandatory.level
    : level
  const effectiveAuditCheckLevel = auditCheckLevel ?? configuredMandatory?.minSeverity
  let dryRun = overrideOptions.dryRun ?? true
  if (overrideOptions.fix) {
    dryRun = false
  }

  const updateResult = await updatePackageJsonDependencies({
    ...overrideOptions,
    level: effectiveLevel,
    dryRun,
    quiet: overrideOptions.quiet
  })

  const mandatoryUpdates = updateResult.updated.filter(update => {
    const from =
      parseSupportedSpec(update.from)?.version ?? semver.coerce(update.from)
    const to =
      parseSupportedSpec(update.to)?.version ?? semver.coerce(update.to)

    if (from === null || to === null) {
      return false
    }

    const updateType = getUpdateType(from, to)
    return UPDATE_LEVEL_RANK[updateType] >= UPDATE_LEVEL_RANK[effectiveLevel]
  })

  let vulnerabilities: Vulnerability[] = []
  if (effectiveAuditCheckLevel !== undefined) {
    if (overrideOptions.fix) {
      const fixResult = await fixVulnerabilities({
        cwd: overrideOptions.cwd,
        minSeverity: effectiveAuditCheckLevel,
        dryRun: false,
        quiet: overrideOptions.quiet
      })
      vulnerabilities = fixResult.vulnerabilities
    } else {
      const auditResult = await checkVulnerabilities({
        cwd: overrideOptions.cwd,
        minSeverity: effectiveAuditCheckLevel,
        quiet: overrideOptions.quiet
      })
      vulnerabilities = auditResult.vulnerabilities
    }
  }

  if (mandatoryUpdates.length > 0 || vulnerabilities.length > 0) {
    return {
      message: getErrorMessageForMandatoryUpdates(
        effectiveLevel,
        mandatoryUpdates.length,
        vulnerabilities.length
      ),
      hasMandatoryUpdates: true,
      updated: mandatoryUpdates,
      vulnerabilities
    }
  }

  return {
    message: getPassedMessageForMandatoryUpdates(effectiveLevel),
    hasMandatoryUpdates: false,
    updated: []
  }
}
