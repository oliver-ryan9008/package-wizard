import { DependencySection, PackageChange } from "./packages"
import type { DependencyConfig } from "./configuration"

export const VulnerabilitySeverity = {
  Info: "info",
  Low: "low",
  Moderate: "moderate",
  High: "high",
  Critical: "critical"
} as const

export type VulnerabilitySeverity =
  (typeof VulnerabilitySeverity)[keyof typeof VulnerabilitySeverity]

export const VULNERABILITY_SEVERITIES = Object.values(VulnerabilitySeverity)

export const VULNERABILITY_SEVERITY_RANK: Record<
  VulnerabilitySeverity,
  number
> = {
  [VulnerabilitySeverity.Info]: 0,
  [VulnerabilitySeverity.Low]: 1,
  [VulnerabilitySeverity.Moderate]: 2,
  [VulnerabilitySeverity.High]: 3,
  [VulnerabilitySeverity.Critical]: 4
}

export const VULNERABILITY_LEVELS = Object.values(VulnerabilitySeverity)

export const SeverityOrder: Record<VulnerabilitySeverity, number> = {
  critical: 4,
  high: 3,
  moderate: 2,
  low: 1,
  info: 0
}

interface NpmAuditVia {
  source?: number
  name?: string
  dependency?: string
  title?: string
  url?: string
  severity?: string
  range?: string
}

interface NpmAuditVulnEntry {
  name: string
  severity: string
  isDirect: boolean
  via: Array<string | NpmAuditVia>
  effects: string[]
  range: string
  nodes: string[]
  fixAvailable:
    boolean | { name: string; version: string; isSemVerMajor: boolean }
}

export interface NpmAuditReport {
  auditReportVersion: number
  vulnerabilities: Record<string, NpmAuditVulnEntry>
}

export interface VulnerabilityFix {
  name?: string
  version: string
  isSemVerMajor: boolean
}

export interface Vulnerability {
  name: string
  severity: VulnerabilitySeverity
  isDirect: boolean
  range: string
  titles: string[]
  fixAvailable: false | VulnerabilityFix
  dependencyChain?: string
}

export interface VulnerabilityCheckOptions {
  cwd?: string
  minSeverity?: VulnerabilitySeverity
  quiet?: boolean
}

export interface VulnerabilityCheckResult {
  vulnerabilities: Vulnerability[]
  total: number
}

export interface VulnerabilityFixChange {
  name: string
  from: string
  to: string
  method: "direct" | "override"
  section?: DependencySection
}

export interface VulnerabilityFixSkip {
  name: string
  reason: string
}

export interface VulnerabilityFixOptions {
  cwd?: string
  minSeverity?: VulnerabilitySeverity
  dryRun?: boolean
  quiet?: boolean
  vulnerabilityFixStrategy?: "lowest" | "highest"
  configLog?: boolean
  dependencyConfig?: DependencyConfig | null
}

export interface VulnerabilityFixResult {
  packageJsonPath: string
  vulnerabilities: Vulnerability[]
  fixed: VulnerabilityFixChange[]
  skipped: VulnerabilityFixSkip[]
}

export interface MandatoryUpdateCheckResult {
  message: string
  hasMandatoryUpdates: boolean
  updated?: PackageChange[]
  vulnerabilities?: Vulnerability[]
}
