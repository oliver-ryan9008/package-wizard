import type { DependencyType, UpdateLevel, VulnerabilitySeverity } from "../types"

/** Policy applied to matching dependencies. */
export type PackageWizardPolicy = {
  /** Whether all updates for matching dependencies are eligible. Defaults to true. */
  enabled?: boolean
  /** SemVer range or /regex/ restricting versions that may be selected. */
  allowedVersions?: string
  /** Whether prerelease versions should be ignored. Defaults to true. */
  ignoreUnstable?: boolean
  /** Whether updates beyond the package's latest dist-tag are disallowed. Defaults to true. */
  respectLatest?: boolean
  /** Whether exact/pinned dependency versions may be updated. Defaults to true. */
  updatePinnedDependencies?: boolean
  /** Minimum age required for a release, in days as text, milliseconds, or false to disable. */
  minimumReleaseAge?: string | number | false
  /** How releases without a publication timestamp are handled. */
  minimumReleaseAgeBehavior?: "timestamp-required" | "timestamp-optional"
  /** Update levels to allow. Accepts one level or an array of levels. "all" expands to patch, minor, and major. */
  enabledUpdateTypes?: UpdateLevel | UpdateLevel[]
  /** Update levels to block. Accepts one level or an array of levels. */
  disabledUpdateTypes?: UpdateLevel | UpdateLevel[]
  /** Dependency sections this rule applies to, such as dependencies or devDependencies. 
   * 
   * Valid options are "dependencies", "devDependencies", "peerDependencies", and "optionalDependencies".
  */
  matchDepTypes?: DependencyType[]
}

/** Baseline policy applied to every dependency. Package version ranges stay package-scoped. */
export type PackageWizardDefaults = Omit<
  PackageWizardPolicy,
  "allowedVersions"
>

/** A rule with an optional package name or wildcard selector. */
export type PackageWizardConfigRule = PackageWizardPolicy & {
  /** Exact package name or * wildcard pattern targeted by this rule. */
  packageName?: string
  /** @deprecated Use packageName instead. */
  package?: string
}

/** Configuration accepted by package.wizard.json and definePackageWizardConfig. */
export type PackageWizardConfigOpts = {
  /** Optional JSON Schema URL used by editors for completion and validation. */
  $schema?: string
  /** Exact package names to exclude from updates and audit fixes. */
  ignore?: string[]
  /** Baseline policy applied before package-specific rules. */
  defaults?: PackageWizardDefaults
  /** Defaults for audit commands. CLI options override these values. */
  audit?: {
    minSeverity?: VulnerabilitySeverity
    showDepChain?: boolean
    vulnerabilityFixStrategy?: "lowest" | "highest"
  }
  /** Peer dependency compatibility policy. Disabled unless explicitly enabled. */
  peerDependencies?: {
    strategy?: "ignore" | "strict"
  }
  /** Defaults for check and mandatory-update commands. CLI options override these values. */
  mandatoryUpdates?: {
    level?: UpdateLevel
    minSeverity?: VulnerabilitySeverity
  }
  /** @deprecated Use the "rules" array with packageName instead.
   * 
   * Rules keyed by exact package name or a * wildcard pattern. 
   * 
  */
  packages?: Record<string, PackageWizardPolicy>
  /** Ordered rules using an optional package selector. */
  rules?: PackageWizardConfigRule[]
}