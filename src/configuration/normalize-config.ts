import type { PackageWizardConfigOpts, PackageWizardPolicy } from "./types"
import type { DependencyConfig, DependencyRule, UpdateLevel } from "../types"

const wildcardToPattern = (value: string): string =>
  `^${value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`

const normalizeTypes = (
  value: PackageWizardPolicy["enabledUpdateTypes"]
): UpdateLevel[] =>
  (value === undefined ? [] : Array.isArray(value) ? value : [value]).flatMap(type =>
    type === "all" ? ["patch", "minor", "major"] : [type]
  )

const normalizePolicy = (policy: PackageWizardPolicy): DependencyRule[] => {
  const { enabled, enabledUpdateTypes, disabledUpdateTypes, ...sharedPolicy } = policy
  const enabledTypes = normalizeTypes(enabledUpdateTypes)
  const disabledTypes = normalizeTypes(disabledUpdateTypes)
  const rules: DependencyRule[] = []
  if (Object.keys(sharedPolicy).length > 0 || enabled !== undefined) {
    rules.push({ ...sharedPolicy, ...(enabled === undefined ? {} : { enabled }) })
  }
  if (enabledTypes.length > 0) rules.push({ enabled: true, matchUpdateTypes: enabledTypes })
  if (disabledTypes.length > 0) rules.push({ enabled: false, matchUpdateTypes: disabledTypes })
  return rules
}

export const normalizePackageWizardConfig = (
  parsed: PackageWizardConfigOpts
): DependencyConfig => {
  const defaults = parsed.defaults ?? {}
  const packageRules: DependencyRule[] = []
  packageRules.push(
    ...normalizePolicy({
      ...(defaults.enabled === undefined ? {} : { enabled: defaults.enabled }),
      ...(defaults.enabledUpdateTypes === undefined ? {} : { enabledUpdateTypes: defaults.enabledUpdateTypes }),
      ...(defaults.disabledUpdateTypes === undefined ? {} : { disabledUpdateTypes: defaults.disabledUpdateTypes }),
      ...(defaults.matchDepTypes === undefined ? {} : { matchDepTypes: defaults.matchDepTypes })
    }).map(rule => ({ ...rule }))
  )

  for (const [packageName, rule] of Object.entries(parsed.packages ?? {})) {
    const matcher = packageName.includes("*")
      ? { matchPackagePatterns: [wildcardToPattern(packageName)] }
      : { matchPackageNames: [packageName] }
    packageRules.push(...normalizePolicy(rule).map(normalizedRule => ({ ...matcher, ...normalizedRule })))
  }

  for (const rule of parsed.rules ?? []) {
    const { packageName, package: deprecatedPackage, ...policy } = rule
    const selector = packageName ?? deprecatedPackage
    const matcher =
      selector === undefined
        ? {}
        : selector.includes("*")
          ? { matchPackagePatterns: [wildcardToPattern(selector)] }
          : { matchPackageNames: [selector] }
    packageRules.push(...normalizePolicy(policy).map(normalizedRule => ({ ...matcher, ...normalizedRule })))
  }

  return {
    ignoreDeps: parsed.ignore,
    packageRules,
    ...(parsed.audit === undefined ? {} : { audit: parsed.audit }),
    ...(parsed.peerDependencies === undefined
      ? {}
      : { peerDependencies: parsed.peerDependencies }),
    ...(parsed.mandatoryUpdates === undefined ? {} : { mandatoryUpdates: parsed.mandatoryUpdates }),
    ...(defaults.ignoreUnstable === undefined ? {} : { ignoreUnstable: defaults.ignoreUnstable }),
    ...(defaults.respectLatest === undefined ? {} : { respectLatest: defaults.respectLatest }),
    ...(defaults.updatePinnedDependencies === undefined ? {} : { updatePinnedDependencies: defaults.updatePinnedDependencies }),
    ...(defaults.minimumReleaseAge === undefined ? {} : { minimumReleaseAge: defaults.minimumReleaseAge }),
    ...(defaults.minimumReleaseAgeBehavior === undefined ? {} : { minimumReleaseAgeBehavior: defaults.minimumReleaseAgeBehavior })
  }
}
