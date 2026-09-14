import semver from "semver"
import { execFileAsync } from "./file-utils"
import { getUpdateType, isRecord, stdoutToString } from "./generic-utils"
import { PackageChange, ParsedSpec, UpdateLevel } from "../types"

export interface TargetUpdate {
  version: string
  updateType: UpdateLevel
}

export interface PackageMetadata {
  versions: string[]
  releaseTimes: Record<string, string>
  latestVersion?: string
}

export const parseSupportedSpec = (spec: string): ParsedSpec | null => {
  const trimmed = spec.trim()

  if (
    trimmed.includes("||") ||
    trimmed.startsWith("workspace:") ||
    trimmed.startsWith("file:") ||
    trimmed.startsWith("link:") ||
    trimmed.startsWith("npm:") ||
    trimmed.startsWith("git+") ||
    trimmed.includes("://")
  ) {
    return null
  }

  const matchRegex: RegExp = /^([~^]?)(.+)$/
  const match = RegExp(matchRegex).exec(trimmed)

  if (match === null) {
    return null
  }

  const rawPrefix = match[1]
  const rawVersion = match[2]

  if (rawVersion === undefined) {
    return null
  }

  const prefix = rawPrefix === "^" || rawPrefix === "~" ? rawPrefix : ""
  const cleaned = semver.clean(rawVersion)

  if (cleaned === null) {
    return null
  }

  const version = semver.parse(cleaned)

  if (version === null) {
    return null
  }

  return { prefix, version }
}

export const getUnsupportedSpecReason = (spec: string): string => {
  const trimmed = spec.trim()
  const categories: Array<[string, string]> = [
    ["workspace:", "workspace protocol"],
    ["file:", "file protocol"],
    ["link:", "link protocol"],
    ["npm:", "npm alias"],
    ["git+", "git dependency"]
  ]

  const category = categories.find(([prefix]) => trimmed.startsWith(prefix))
  if (category) {
    return `Unsupported version spec: ${category[1]}`
  }

  if (trimmed.includes("://")) {
    return "Unsupported version spec: URL dependency"
  }

  if (trimmed.includes("||")) {
    return "Unsupported version spec: compound range"
  }

  return "Unsupported version spec: invalid semver"
}

export const getAllVersions = async (
  packageName: string,
  cwd: string
): Promise<string[]> => {
  const { stdout } = await execFileAsync(
    "npm",
    ["view", packageName, "versions", "--json"],
    { cwd, maxBuffer: 1024 * 1024 * 20 }
  )

  const rawOutput = stdoutToString(stdout).trim()
  const value = JSON.parse(rawOutput) as unknown

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string")
  }

  if (typeof value === "string") {
    return [value]
  }

  return []
}

export const getPackageMetadata = async (
  packageName: string,
  cwd: string
): Promise<PackageMetadata> => {
  const { stdout } = await execFileAsync(
    "npm",
    ["view", packageName, "versions", "time", "dist-tags", "--json"],
    {
      cwd,
      maxBuffer: 1024 * 1024 * 20
    }
  )

  let value = JSON.parse(stdoutToString(stdout).trim()) as unknown

  // npm 12 can wrap multi-field `npm view` output in a singleton array.
  if (Array.isArray(value) && value.length === 1 && isRecord(value[0])) {
    value = value[0]
  }

  if (Array.isArray(value)) {
    return {
      versions: value.filter(
        (entry): entry is string => typeof entry === "string"
      ),
      releaseTimes: Object.fromEntries(
        value
          .filter((entry): entry is string => typeof entry === "string")
          .map(version => [version, new Date(0).toISOString()])
      )
    }
  }

  if (typeof value === "string") {
    return {
      versions: [value],
      releaseTimes: { [value]: new Date(0).toISOString() }
    }
  }

  if (!isRecord(value)) {
    return { versions: [], releaseTimes: {} }
  }

  const versions = Array.isArray(value.versions)
    ? value.versions.filter(
        (entry): entry is string => typeof entry === "string"
      )
    : []
  const rawTimes = value.time
  const rawDistTags = value["dist-tags"]
  const latestVersion =
    isRecord(rawDistTags) && typeof rawDistTags.latest === "string"
      ? rawDistTags.latest
      : undefined
  const releaseTimes: Record<string, string> = {}

  if (isRecord(rawTimes)) {
    for (const [version, publishedAt] of Object.entries(rawTimes)) {
      if (typeof publishedAt === "string") {
        releaseTimes[version] = publishedAt
      }
    }
  }

  return { versions, releaseTimes, latestVersion }
}

const durationPattern =
  /^(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|s|minutes?|m|hours?|h|days?|d|weeks?|w)$/i

export const parseMinimumReleaseAge = (
  value: string | number | false
): number => {
  if (value === false) {
    return 0
  }

  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value
  }

  if (typeof value !== "string") {
    return 24 * 60 * 60 * 1000
  }

  const match = durationPattern.exec(value.trim())

  if (!match) {
    return 24 * 60 * 60 * 1000
  }

  const amount = Number(match[1])
  const unit = match[2].toLowerCase()
  const multipliers: Record<string, number> = {
    ms: 1,
    millisecond: 1,
    milliseconds: 1,
    s: 1000,
    second: 1000,
    seconds: 1000,
    m: 60 * 1000,
    minute: 60 * 1000,
    minutes: 60 * 1000,
    h: 60 * 60 * 1000,
    hour: 60 * 60 * 1000,
    hours: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    weeks: 7 * 24 * 60 * 60 * 1000
  }

  return amount * (multipliers[unit] ?? 24 * 60 * 60 * 1000)
}

export const filterVersionsByReleaseAge = (
  versions: string[],
  releaseTimes: Record<string, string>,
  minimumReleaseAge: string | number | false,
  now = Date.now(),
  behaviour: "timestamp-required" | "timestamp-optional" = "timestamp-required"
): string[] => {
  const minimumAge = parseMinimumReleaseAge(minimumReleaseAge)
  return filterVersionsByReleaseAgeMs(
    versions,
    releaseTimes,
    minimumAge,
    now,
    behaviour
  )
}

const filterVersionsByReleaseAgeMs = (
  versions: string[],
  releaseTimes: Record<string, string>,
  minimumAge: number,
  now: number,
  behaviour: "timestamp-required" | "timestamp-optional"
): string[] => {
  const cutoff = now - minimumAge

  return versions.filter(version => {
    const publishedAt = Date.parse(releaseTimes[version] ?? "")
    if (!Number.isFinite(publishedAt)) {
      return behaviour === "timestamp-optional"
    }

    return Number.isFinite(publishedAt) && publishedAt <= cutoff
  })
}

export const getPackageChangeUpdateType = (
  change: PackageChange
): UpdateLevel | null => {
  const fromVersion =
    parseSupportedSpec(change.from)?.version ?? semver.coerce(change.from)

  const toVersion =
    parseSupportedSpec(change.to)?.version ?? semver.coerce(change.to)

  if (fromVersion === null || toVersion === null) {
    return null
  }

  return getUpdateType(fromVersion, toVersion)
}

export const getCandidateVersions = (
  versions: string[],
  currentVersion: semver.SemVer,
  level: UpdateLevel,
  ignoreUnstable = true
): semver.SemVer[] => {
  return versions
    .map(version => semver.parse(version))
    .filter((version): version is semver.SemVer => version !== null)
    .filter(version => !ignoreUnstable || version.prerelease.length === 0)
    .filter(version => {
      if (level === "patch") {
        return (
          version.major === currentVersion.major &&
          version.minor === currentVersion.minor
        )
      }

      if (level === "minor") {
        return version.major === currentVersion.major
      }

      return true
    })
    .filter(version => semver.gt(version, currentVersion))
    .sort(semver.rcompare)
}

export const selectTargetVersion = (
  versions: string[],
  currentVersion: semver.SemVer,
  level: UpdateLevel,
  ignoreUnstable = true
): string | null => {
  const firstVersion = getCandidateVersions(
    versions,
    currentVersion,
    level,
    ignoreUnstable
  )[0]

  return firstVersion?.version ?? null
}

export const selectTargetUpdate = (
  versions: string[],
  currentVersion: semver.SemVer,
  level: UpdateLevel,
  isAllowed: (updateType: UpdateLevel, version: semver.SemVer) => boolean,
  ignoreUnstable = true
): TargetUpdate | null => {
  const candidateVersions = getCandidateVersions(
    versions,
    currentVersion,
    level,
    ignoreUnstable
  )

  for (const candidateVersion of candidateVersions) {
    const updateType = getUpdateType(currentVersion, candidateVersion)

    if (!isAllowed(updateType, candidateVersion)) {
      continue
    }

    return {
      version: candidateVersion.version,
      updateType
    }
  }

  return null
}
