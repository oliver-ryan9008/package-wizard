import { UpdateLevel } from "./cli"

export interface RenovatePackageRule {
  enabled?: boolean
  allowedVersions?: string
  ignoreUnstable?: boolean
  respectLatest?: boolean
  updatePinnedDependencies?: boolean
  matchPackageNames?: string[]
  matchPackagePatterns?: string[]
  matchPackagePrefixes?: string[]
  matchUpdateTypes?: UpdateLevel[]
  matchDepTypes?: string[]
  [key: string]: unknown
}

export interface RenovateConfig {
  ignoreDeps?: string[]
  ignoreUnstable?: boolean
  minimumReleaseAge?: string | number | false
  minimumReleaseAgeBehaviour?: "timestamp-required" | "timestamp-optional"
  packageRules?: RenovatePackageRule[]
  respectLatest?: boolean
  updatePinnedDependencies?: boolean
  vulnerabilityAlerts?: {
    enabled?: boolean
    vulnerabilityFixStrategy?: "lowest" | "highest"
  }
  [key: string]: unknown
}
