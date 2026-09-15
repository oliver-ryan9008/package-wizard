import { VulnerabilitySeverity } from "./audit"
import type { DependencyConfig } from "./configuration"

export const UpdateLevel = {
  All: "all",
  Patch: "patch",
  Minor: "minor",
  Major: "major"
} as const

export type UpdateLevel = (typeof UpdateLevel)[keyof typeof UpdateLevel]

export const UPDATE_LEVELS = Object.values(UpdateLevel)

export const CliCommand = {
  Update: "update",
  Audit: "audit",
  PeerCheck: "peer-check",
  Check: "check",
  Pin: "pin",
  About: "about",
  Completion: "completion"
} as const

export type CliCommand = (typeof CliCommand)[keyof typeof CliCommand]

export const ColorMode = {
  Auto: "auto",
  Always: "always",
  Never: "never"
} as const

export type ColorMode = (typeof ColorMode)[keyof typeof ColorMode]

export const Shell = {
  Bash: "bash",
  Zsh: "zsh",
  Fish: "fish"
} as const

export type Shell = (typeof Shell)[keyof typeof Shell]

export const UPDATE_LEVEL_RANK: Record<UpdateLevel, number> = {
  [UpdateLevel.All]: 4,
  [UpdateLevel.Patch]: 1,
  [UpdateLevel.Minor]: 2,
  [UpdateLevel.Major]: 3
}

interface BaseOptions {
  cwd?: string
  dryRun?: boolean
  apply?: boolean
  fix?: boolean
  skip?: string[]
  mandatoryUpdateCheck?: boolean
  quiet?: boolean
  verbose?: boolean
  configLog?: boolean
  dependencyConfig?: DependencyConfig | null
  color?: ColorMode
  command?: CliCommand
  completion?: Shell
}

interface UpdateBehaviorOptions {
  level?: UpdateLevel
  pin?: boolean
  noUpdate?: boolean
}

interface AuditOptions {
  audit?: boolean
  minSeverity?: VulnerabilitySeverity
  showDepChain?: boolean
}

export interface CliOptions
  extends BaseOptions, UpdateBehaviorOptions, AuditOptions {
  checkPeerDeps?: boolean
  json?: boolean
  help?: boolean
  version?: boolean
}

export interface UpdateOptions extends BaseOptions, UpdateBehaviorOptions { }

export type DependencyType = "dependencies" | "devDependencies" | "peerDependencies" | "optionalDependencies"
