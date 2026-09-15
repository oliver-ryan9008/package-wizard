import type { UpdateLevel } from "./cli"
import type { VulnerabilitySeverity } from "./audit"

export interface DependencyRule {
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

export interface DependencyConfig {
  ignoreDeps?: string[]
  ignoreUnstable?: boolean
  minimumReleaseAge?: string | number | false
  minimumReleaseAgeBehavior?: "timestamp-required" | "timestamp-optional"
  packageRules?: DependencyRule[]
  respectLatest?: boolean
  updatePinnedDependencies?: boolean
  vulnerabilityAlerts?: {
    enabled?: boolean
    vulnerabilityFixStrategy?: "lowest" | "highest"
  }
  audit?: {
    minSeverity?: VulnerabilitySeverity
    showDepChain?: boolean
    vulnerabilityFixStrategy?: "lowest" | "highest"
  }
  peerDependencies?: {
    strategy?: "ignore" | "strict"
  }
  mandatoryUpdates?: {
    level?: UpdateLevel
    minSeverity?: VulnerabilitySeverity
  }
  [key: string]: unknown
}
