import semver from "semver"

export const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies"
] as const
export type DependencySection = (typeof DEPENDENCY_SECTIONS)[number]

export interface ParsedSpec {
  prefix: "" | "^" | "~"
  version: semver.SemVer
}

export interface PackageChange {
  section: DependencySection
  name: string
  from: string
  to: string
}

export interface SkipInfo {
  section: DependencySection
  name: string
  reason: string
}

export interface UpdateResult {
  packageJsonPath: string
  updated: PackageChange[]
  skipped: SkipInfo[]
  renovateExcluded: SkipInfo[]
  releaseAgeWarnings?: SkipInfo[]
  releaseAgeErrors?: SkipInfo[]
  minimumReleaseAge?: string | number | false
}
