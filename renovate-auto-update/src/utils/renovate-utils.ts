import { hasItems } from "./generic-utils"
import {
  DependencySection,
  RenovateConfig,
  RenovatePackageRule,
  UPDATE_LEVEL_RANK,
  UpdateLevel
} from "../types"
import semver from "semver"

const packagePatternCache = new WeakMap<RenovatePackageRule, RegExp[]>()

const getPackagePatterns = (rule: RenovatePackageRule): RegExp[] => {
  const cached = packagePatternCache.get(rule)
  if (cached) {
    return cached
  }

  const patterns = (rule.matchPackagePatterns ?? []).map(pattern => {
    try {
      return new RegExp(pattern)
    } catch {
      throw new Error(`Invalid package rule pattern: ${pattern}`)
    }
  })

  packagePatternCache.set(rule, patterns)
  return patterns
}

export const isUpdateWithinRequestedLevel = (
  updateType: UpdateLevel,
  requestedUpdateLevel: UpdateLevel
): boolean => {
  return (
    UPDATE_LEVEL_RANK[updateType] <= UPDATE_LEVEL_RANK[requestedUpdateLevel]
  )
}

export const doesRuleMatchUpdateType = (
  rule: RenovatePackageRule,
  updateType: UpdateLevel
): boolean => {
  if (!rule.matchUpdateTypes?.length) {
    return true
  }

  return rule.matchUpdateTypes.includes(updateType)
}

export const packageMatchesRule = (
  name: string,
  section: DependencySection,
  rule: RenovatePackageRule
): boolean => {
  if (rule.matchDepTypes?.length) {
    if (!rule.matchDepTypes.includes(section)) {
      return false
    }
  }

  const hasNameMatcher =
    hasItems(rule.matchPackageNames) ||
    hasItems(rule.matchPackagePatterns) ||
    hasItems(rule.matchPackagePrefixes)

  if (!hasNameMatcher) {
    return true
  }

  if (rule.matchPackageNames?.includes(name)) {
    return true
  }

  for (const pattern of getPackagePatterns(rule)) {
    if (pattern.test(name)) {
      return true
    }
  }

  for (const prefix of rule.matchPackagePrefixes ?? []) {
    if (name.startsWith(prefix)) {
      return true
    }
  }

  return false
}

export const doesRuleMatch = (
  rule: RenovatePackageRule,
  packageName: string,
  updateType: UpdateLevel,
  section: DependencySection
): boolean => {
  return (
    packageMatchesRule(packageName, section, rule) &&
    doesRuleMatchUpdateType(rule, updateType)
  )
}

export const getMatchingPackageRules = (
  config: RenovateConfig | null,
  packageName: string,
  section: DependencySection
): RenovatePackageRule[] => {
  return (config?.packageRules ?? []).filter(rule =>
    packageMatchesRule(packageName, section, rule)
  )
}

/**
 * Package disabled regardless of update type.
 *
 * Example:
 * {
 *   enabled: false,
 *   matchPackageNames: ["react"]
 * }
 */
export const isPackageDisabledByMatchingRules = (
  rules: RenovatePackageRule[]
): boolean => {
  return rules.some(
    rule =>
      rule.enabled === false &&
      (!rule.matchUpdateTypes || rule.matchUpdateTypes.length === 0)
  )
}

export const isPackageDisabledByRenovateConfig = (
  config: RenovateConfig | null,
  packageName: string,
  section: DependencySection
): boolean => {
  const rules = getMatchingPackageRules(config, packageName, section)

  return isPackageDisabledByMatchingRules(rules)
}

export const isPackageIgnoredByRenovateConfig = (
  config: RenovateConfig | null,
  packageName: string
): boolean => {
  return config?.ignoreDeps?.includes(packageName) ?? false
}

const matchesAllowedVersions = (version: string, allowedVersions: string) => {
  if (allowedVersions.startsWith("/") && allowedVersions.endsWith("/")) {
    try {
      return new RegExp(allowedVersions.slice(1, -1)).test(version)
    } catch {
      throw new Error(`Invalid allowedVersions pattern: ${allowedVersions}`)
    }
  }

  return semver.satisfies(version, allowedVersions)
}

export const isVersionAllowedByRenovateConfig = (
  config: RenovateConfig | null,
  packageName: string,
  version: string,
  section: DependencySection
): boolean => {
  const rules = getMatchingPackageRules(config, packageName, section)
  return rules.every(
    rule =>
      rule.allowedVersions === undefined ||
      matchesAllowedVersions(version, rule.allowedVersions)
  )
}

export const isPackageIgnoredOrDisabledByRenovateConfig = (
  config: RenovateConfig | null,
  packageName: string,
  section: DependencySection
): boolean => {
  return (
    isPackageIgnoredByRenovateConfig(config, packageName) ||
    isPackageDisabledByRenovateConfig(config, packageName, section)
  )
}

export const shouldIgnoreUnstableByRenovateConfig = (
  config: RenovateConfig | null,
  packageName: string,
  section: DependencySection
): boolean => {
  const rules = getMatchingPackageRules(config, packageName, section)
  const matchingRule = [...rules]
    .reverse()
    .find(rule => rule.ignoreUnstable !== undefined)

  return matchingRule?.ignoreUnstable ?? config?.ignoreUnstable ?? true
}

export const shouldRespectLatestByRenovateConfig = (
  config: RenovateConfig | null,
  packageName: string,
  section: DependencySection
): boolean => {
  const rules = getMatchingPackageRules(config, packageName, section)
  const matchingRule = [...rules]
    .reverse()
    .find(rule => rule.respectLatest !== undefined)

  return matchingRule?.respectLatest ?? config?.respectLatest ?? true
}

export const shouldUpdatePinnedDependencyByRenovateConfig = (
  config: RenovateConfig | null,
  packageName: string,
  section: DependencySection
): boolean => {
  const rules = getMatchingPackageRules(config, packageName, section)
  const matchingRule = [...rules]
    .reverse()
    .find(rule => rule.updatePinnedDependencies !== undefined)

  return (
    matchingRule?.updatePinnedDependencies ??
    config?.updatePinnedDependencies ??
    true
  )
}

export const hasExplicitAllowRules = (
  rules: RenovatePackageRule[]
): boolean => {
  return rules.some(
    rule => rule.enabled === true && (rule.matchUpdateTypes?.length ?? 0) > 0
  )
}

export const getExplicitlyAllowedUpdateTypes = (
  rules: RenovatePackageRule[]
): Set<UpdateLevel> => {
  const allowedUpdateTypes = new Set<UpdateLevel>()

  for (const rule of rules) {
    if (rule.enabled !== true) {
      continue
    }

    for (const updateType of rule.matchUpdateTypes ?? []) {
      allowedUpdateTypes.add(updateType)
    }
  }

  return allowedUpdateTypes
}

export const isUpdateBlockedByExplicitAllowRules = (
  rules: RenovatePackageRule[],
  updateType: UpdateLevel
): boolean => {
  if (!hasExplicitAllowRules(rules)) {
    return false
  }

  const allowedUpdateTypes = getExplicitlyAllowedUpdateTypes(rules)

  return !allowedUpdateTypes.has(updateType)
}

export const isUpdateBlockedByDisabledRules = (
  rules: RenovatePackageRule[],
  updateType: UpdateLevel
): boolean => {
  return rules.some(
    rule =>
      rule.enabled === false &&
      rule.matchUpdateTypes?.length &&
      doesRuleMatchUpdateType(rule, updateType)
  )
}

export const isUpdateDisabledByMatchingRules = (
  rules: RenovatePackageRule[],
  updateType: UpdateLevel
): boolean => {
  if (rules.length === 0) {
    return false
  }

  if (isUpdateBlockedByExplicitAllowRules(rules, updateType)) {
    return true
  }

  if (isUpdateBlockedByDisabledRules(rules, updateType)) {
    return true
  }

  return false
}

export const isUpdateDisabledByRenovateConfig = (
  config: RenovateConfig | null,
  packageName: string,
  updateType: UpdateLevel,
  section: DependencySection
): boolean => {
  const rules = getMatchingPackageRules(config, packageName, section)

  return isUpdateDisabledByMatchingRules(rules, updateType)
}

export const shouldSkipUpdate = (
  config: RenovateConfig | null,
  packageName: string,
  updateType: UpdateLevel,
  requestedUpdateLevel: UpdateLevel,
  section: DependencySection
): boolean => {
  if (!isUpdateWithinRequestedLevel(updateType, requestedUpdateLevel)) {
    return true
  }

  return isUpdateDisabledByRenovateConfig(
    config,
    packageName,
    updateType,
    section
  )
}
