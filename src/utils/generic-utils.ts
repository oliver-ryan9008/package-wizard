import { PackageJson } from "type-fest"
import semver from "semver"
import {
  DependencySection,
  VulnerabilitySeverity,
  VULNERABILITY_SEVERITIES,
  UpdateLevel,
  UPDATE_LEVEL_RANK
} from "../types"

export const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export const hasItems = <T>(
  value: readonly T[] | undefined
): value is readonly T[] => {
  return value !== undefined && value.length > 0
}

export const isVulnerabilitySeverity = (
  value: string
): value is VulnerabilitySeverity => {
  return VULNERABILITY_SEVERITIES.includes(value as VulnerabilitySeverity)
}

export const stdoutToString = (stdout: string | Buffer): string => {
  return typeof stdout === "string" ? stdout : stdout.toString("utf8")
}

export const getDependencyRecord = (
  packageJson: PackageJson,
  section: DependencySection
): Record<string, string> | null => {
  const value = packageJson[section]

  if (!isRecord(value)) {
    return null
  }

  const entries = Object.entries(value)

  if (
    !entries.every(([, dependencyValue]) => typeof dependencyValue === "string")
  ) {
    return null
  }

  return value as Record<string, string>
}

export const getOrCreateStringRecord = (
  target: Record<string, unknown>,
  key: string
): Record<string, string> => {
  const existing = target[key]

  if (isRecord(existing)) {
    const stringEntries = Object.entries(existing).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )

    return Object.fromEntries(stringEntries)
  }

  return {}
}

export const getUpdateType = (
  current: semver.SemVer,
  next: semver.SemVer
): UpdateLevel => {
  if (next.major > current.major) {
    return UpdateLevel.Major
  }

  if (next.minor > current.minor) {
    return UpdateLevel.Minor
  }

  return UpdateLevel.Patch
}

export const isUpdateEqualToOrGreaterThanLevel = (
  updateType: UpdateLevel,
  requiredLevel: UpdateLevel
): boolean => {
  return UPDATE_LEVEL_RANK[updateType] >= UPDATE_LEVEL_RANK[requiredLevel]
}
