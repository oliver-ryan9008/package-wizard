import { isRecord } from "../utils/generic-utils"

const validatePackageRule = (
  rule: Record<string, unknown>,
  configPath: string
): void => {
  for (const key of ["enabled", "ignoreUnstable", "respectLatest", "updatePinnedDependencies"]) {
    if (rule[key] !== undefined && typeof rule[key] !== "boolean") {
      throw new Error(`${configPath} packageRules.${key} must be boolean`)
    }
  }

  if (rule.allowedVersions !== undefined && typeof rule.allowedVersions !== "string") {
    throw new Error(`${configPath} packageRules.allowedVersions must be a string`)
  }

  for (const key of [
    "matchPackageNames",
    "matchPackagePatterns",
    "matchPackagePrefixes",
    "matchUpdateTypes",
    "matchDepTypes"
  ]) {
    if (
      rule[key] !== undefined &&
      (!Array.isArray(rule[key]) || rule[key].some(value => typeof value !== "string"))
    ) {
      throw new Error(`${configPath} packageRules.${key} must be a string array`)
    }
  }
}

export const validateFallbackConfig = (
  parsed: Record<string, unknown>,
  configPath: string
): void => {
  const minimumReleaseAge = parsed.minimumReleaseAge
  if (
    minimumReleaseAge !== undefined &&
    typeof minimumReleaseAge !== "string" &&
    typeof minimumReleaseAge !== "number" &&
    minimumReleaseAge !== false
  ) {
    throw new Error(`${configPath} has invalid minimumReleaseAge`)
  }

  // Renovate uses British spelling for "behaviour" instead of "behavior"
  // British people. smh
  const ageBehavior = parsed.minimumReleaseAgeBehavior ?? parsed.minimumReleaseAgeBehaviour
  if (
    ageBehavior !== undefined &&
    ageBehavior !== "timestamp-required" &&
    ageBehavior !== "timestamp-optional"
  ) {
    throw new Error(`${configPath} has invalid minimumReleaseAgeBehavior`)
  }

  if (
    parsed.ignoreDeps !== undefined &&
    (!Array.isArray(parsed.ignoreDeps) || parsed.ignoreDeps.some(value => typeof value !== "string"))
  ) {
    throw new Error(`${configPath} ignoreDeps must be a string array`)
  }

  for (const key of ["ignoreUnstable", "respectLatest", "updatePinnedDependencies"]) {
    if (parsed[key] !== undefined && typeof parsed[key] !== "boolean") {
      throw new Error(`${configPath} ${key} must be boolean`)
    }
  }

  const alerts = parsed.vulnerabilityAlerts
  if (
    alerts !== undefined &&
    (!isRecord(alerts) ||
      (alerts.vulnerabilityFixStrategy !== undefined &&
        alerts.vulnerabilityFixStrategy !== "lowest" &&
        alerts.vulnerabilityFixStrategy !== "highest"))
  ) {
    throw new Error(
      `${configPath} vulnerabilityAlerts.vulnerabilityFixStrategy must be lowest or highest`
    )
  }

  if (parsed.packageRules === undefined) return
  if (!Array.isArray(parsed.packageRules)) {
    throw new Error(`${configPath} packageRules must be an array`)
  }
  for (const rule of parsed.packageRules) {
    if (!isRecord(rule)) {
      throw new Error(`${configPath} packageRules must contain objects`)
    }
    validatePackageRule(rule, configPath)
  }
}

export const validatePackageWizardConfig = (
  parsed: Record<string, unknown>,
  configPath: string
): void => {
  const updateLevels = new Set(["all", "patch", "minor", "major"])
  const vulnerabilitySeverities = new Set(["info", "low", "moderate", "high", "critical"])
  const validateNativePolicy = (
    policy: Record<string, unknown>,
    rulePath: string
  ): void => {
    validatePackageRule(policy, rulePath)
    if (policy.matchUpdateTypes !== undefined) {
      throw new Error(
        `${rulePath} uses matchUpdateTypes, which is Renovate syntax. Use enabledUpdateTypes or disabledUpdateTypes instead.`
      )
    }

    const getTypes = (key: "enabledUpdateTypes" | "disabledUpdateTypes"): string[] => {
      const value = policy[key]
      const values = value === undefined ? [] : Array.isArray(value) ? value : [value]
      if (values.some(item => typeof item !== "string" || !updateLevels.has(item))) {
        throw new Error(
          `${rulePath} ${key} must be "patch", "minor", or "major", or an array of those values.`
        )
      }
      return values as string[]
    }

    const enabledTypes = getTypes("enabledUpdateTypes")
    const disabledTypes = getTypes("disabledUpdateTypes")
    const overlap = enabledTypes.filter(type => disabledTypes.includes(type))
    if (overlap.length > 0) {
      throw new Error(
        `${rulePath} enables and disables ${overlap.join(", ")} updates. Remove each overlapping type from one list.`
      )
    }
    if (policy.enabled === false && enabledTypes.length > 0) {
      throw new Error(
        `${rulePath} disables all updates and also enables update types. Remove enabledUpdateTypes or set enabled to true.`
      )
    }
  }

  const nativeRules: Array<{ selector: string; policy: Record<string, unknown> }> = []
  const collectRule = (selector: string, policy: Record<string, unknown>, rulePath: string): void => {
    validateNativePolicy(policy, rulePath)
    nativeRules.push({ selector, policy })
  }

  if (
    parsed.ignore !== undefined &&
    (!Array.isArray(parsed.ignore) || parsed.ignore.some(value => typeof value !== "string"))
  ) {
    throw new Error(`${configPath} ignore must be a string array`)
  }
  if (parsed.audit !== undefined) {
    if (!isRecord(parsed.audit)) throw new Error(`${configPath} audit must be an object`)
    if (parsed.audit.minSeverity !== undefined && !vulnerabilitySeverities.has(String(parsed.audit.minSeverity))) {
      throw new Error(`${configPath} audit.minSeverity must be critical, high, moderate, low, or info`)
    }
    if (parsed.audit.showDepChain !== undefined && typeof parsed.audit.showDepChain !== "boolean") {
      throw new Error(`${configPath} audit.showDepChain must be boolean`)
    }
    if (
      parsed.audit.vulnerabilityFixStrategy !== undefined &&
      parsed.audit.vulnerabilityFixStrategy !== "lowest" &&
      parsed.audit.vulnerabilityFixStrategy !== "highest"
    ) {
      throw new Error(`${configPath} audit.vulnerabilityFixStrategy must be lowest or highest`)
    }
  }
  if (parsed.peerDependencies !== undefined) {
    if (!isRecord(parsed.peerDependencies)) {
      throw new Error(`${configPath} peerDependencies must be an object`)
    }
    if (
      parsed.peerDependencies.strategy !== undefined &&
      parsed.peerDependencies.strategy !== "ignore" &&
      parsed.peerDependencies.strategy !== "strict"
    ) {
      throw new Error(`${configPath} peerDependencies.strategy must be ignore or strict`)
    }
  }
  if (parsed.mandatoryUpdates !== undefined) {
    if (!isRecord(parsed.mandatoryUpdates)) {
      throw new Error(`${configPath} mandatoryUpdates must be an object`)
    }
    if (parsed.mandatoryUpdates.level !== undefined && !updateLevels.has(String(parsed.mandatoryUpdates.level))) {
      throw new Error(`${configPath} mandatoryUpdates.level must be all, patch, minor, or major`)
    }
    if (
      parsed.mandatoryUpdates.minSeverity !== undefined &&
      !vulnerabilitySeverities.has(String(parsed.mandatoryUpdates.minSeverity))
    ) {
      throw new Error(`${configPath} mandatoryUpdates.minSeverity must be critical, high, moderate, low, or info`)
    }
  }
  for (const key of ["packages", "defaults"]) {
    if (parsed[key] !== undefined && !isRecord(parsed[key])) {
      throw new Error(`${configPath} ${key} must be an object`)
    }
  }
  if (isRecord(parsed.defaults)) {
    if (parsed.defaults.allowedVersions !== undefined) {
      throw new Error(
        `${configPath} defaults.allowedVersions is package-specific. Put it under packages or rules.`
      )
    }
    collectRule("<defaults>", parsed.defaults, `${configPath} defaults`)
  }
  if (isRecord(parsed.packages)) {
    for (const [packageName, rule] of Object.entries(parsed.packages)) {
      if (!isRecord(rule)) throw new Error(`${configPath} packages.${packageName} must be an object`)
      collectRule(packageName, rule, `${configPath} packages.${packageName}`)
    }
  }
  if (parsed.rules !== undefined && !Array.isArray(parsed.rules)) {
    throw new Error(`${configPath} rules must be an array`)
  }
  for (const rule of parsed.rules ?? []) {
    if (
      !isRecord(rule) ||
      (rule.packageName !== undefined && typeof rule.packageName !== "string") ||
      (rule.package !== undefined && typeof rule.package !== "string")
    ) {
      throw new Error(`${configPath} rules must contain objects with string packageName values`)
    }
    if (rule.packageName !== undefined && rule.package !== undefined && rule.packageName !== rule.package) {
      throw new Error(`${configPath} rules packageName and deprecated package must match`)
    }
    const { packageName, ...policy } = rule
    delete policy.package
    collectRule(packageName ?? rule.package ?? "<all>", policy, `${configPath} rules`)
  }

  const asTypes = (value: unknown): string[] =>
    (value === undefined
      ? []
      : Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : typeof value === "string"
          ? [value]
          : []
    ).flatMap(type => (type === "all" ? ["patch", "minor", "major"] : [type]))
  for (let index = 0; index < nativeRules.length; index += 1) {
    const current = nativeRules[index]
    if (!current || current.selector === "<defaults>") continue
    for (let nextIndex = index + 1; nextIndex < nativeRules.length; nextIndex += 1) {
      const next = nativeRules[nextIndex]
      if (!next || next.selector !== current.selector) continue
      if (
        current.policy.enabled !== undefined &&
        next.policy.enabled !== undefined &&
        current.policy.enabled !== next.policy.enabled
      ) {
        throw new Error(
          `${configPath} has conflicting enabled values for ${current.selector}. Keep one enabled value or combine the rules.`
        )
      }
      const conflictingTypes = [
        ...asTypes(current.policy.enabledUpdateTypes).filter(type => asTypes(next.policy.disabledUpdateTypes).includes(type)),
        ...asTypes(next.policy.enabledUpdateTypes).filter(type => asTypes(current.policy.disabledUpdateTypes).includes(type))
      ]
      if (conflictingTypes.length > 0) {
        throw new Error(
          `${configPath} has conflicting update-type rules for ${current.selector}: ${[...new Set(conflictingTypes)].join(", ")}. Remove each type from one rule.`
        )
      }
    }
  }
}
