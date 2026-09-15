import { hasItems } from "./generic-utils"
import {
  DependencySection,
  DependencyConfig,
  DependencyRule,
  UPDATE_LEVEL_RANK,
  UpdateLevel
} from "../types"
import semver from "semver"

const packagePatternCache = new WeakMap<DependencyRule, RegExp[]>()

const getPackagePatterns = (rule: DependencyRule): RegExp[] => {
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
  rule: DependencyRule,
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
  rule: DependencyRule
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
  rule: DependencyRule,
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
  config: DependencyConfig | null,
  packageName: string,
  section: DependencySection
): DependencyRule[] => {
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
  rules: DependencyRule[]
): boolean => {
  return rules.some(
    rule =>
      rule.enabled === false &&
      (!rule.matchUpdateTypes || rule.matchUpdateTypes.length === 0)
  )
}

export const isPackageDisabledByConfig = (
  config: DependencyConfig | null,
  packageName: string,
  section: DependencySection
): boolean => {
  const rules = getMatchingPackageRules(config, packageName, section)

  return isPackageDisabledByMatchingRules(rules)
}

export const isPackageIgnoredByConfig = (
  config: DependencyConfig | null,
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

export const isVersionAllowedByConfig = (
  config: DependencyConfig | null,
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

export const isPackageIgnoredOrDisabledByConfig = (
  config: DependencyConfig | null,
  packageName: string,
  section: DependencySection
): boolean => {
  return (
    isPackageIgnoredByConfig(config, packageName) ||
    isPackageDisabledByConfig(config, packageName, section)
  )
}

export const shouldIgnoreUnstableByConfig = (
  config: DependencyConfig | null,
  packageName: string,
  section: DependencySection
): boolean => {
  const rules = getMatchingPackageRules(config, packageName, section)
  const matchingRule = [...rules]
    .reverse()
    .find(rule => rule.ignoreUnstable !== undefined)

  return matchingRule?.ignoreUnstable ?? config?.ignoreUnstable ?? true
}

export const shouldRespectLatestByConfig = (
  config: DependencyConfig | null,
  packageName: string,
  section: DependencySection
): boolean => {
  const rules = getMatchingPackageRules(config, packageName, section)
  const matchingRule = [...rules]
    .reverse()
    .find(rule => rule.respectLatest !== undefined)

  return matchingRule?.respectLatest ?? config?.respectLatest ?? true
}

export const shouldUpdatePinnedDependencyByConfig = (
  config: DependencyConfig | null,
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
  rules: DependencyRule[]
): boolean => {
  return rules.some(
    rule => rule.enabled === true && (rule.matchUpdateTypes?.length ?? 0) > 0
  )
}

export const getExplicitlyAllowedUpdateTypes = (
  rules: DependencyRule[]
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
  rules: DependencyRule[],
  updateType: UpdateLevel
): boolean => {
  if (!hasExplicitAllowRules(rules)) {
    return false
  }

  const allowedUpdateTypes = getExplicitlyAllowedUpdateTypes(rules)

  return !allowedUpdateTypes.has(updateType)
}

export const isUpdateBlockedByDisabledRules = (
  rules: DependencyRule[],
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
  rules: DependencyRule[],
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

export const isUpdateDisabledByConfig = (
  config: DependencyConfig | null,
  packageName: string,
  updateType: UpdateLevel,
  section: DependencySection
): boolean => {
  const rules = getMatchingPackageRules(config, packageName, section)

  return isUpdateDisabledByMatchingRules(rules, updateType)
}

export const shouldSkipUpdate = (
  config: DependencyConfig | null,
  packageName: string,
  updateType: UpdateLevel,
  requestedUpdateLevel: UpdateLevel,
  section: DependencySection
): boolean => {
  if (!isUpdateWithinRequestedLevel(updateType, requestedUpdateLevel)) {
    return true
  }

  return isUpdateDisabledByConfig(
    config,
    packageName,
    updateType,
    section
  )
}
