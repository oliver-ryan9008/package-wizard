import { CliCommand } from "./types"

export interface CliOptionDefinition {
  flags: string
  description: string
  commands?: readonly CliCommand[]
}

export interface CliCommandDefinition {
  command: CliCommand
  label: string
  description: string
  usage: string
  supportsApply: boolean
  examples: readonly string[]
}

export const COMMAND_DEFINITIONS: readonly CliCommandDefinition[] = [
  {
    command: CliCommand.Update,
    label: "Preview dependency updates",
    description: "Find eligible dependency updates without changing files.",
    usage: "renovate-auto-update update [options]",
    supportsApply: true,
    examples: [
      "renovate-auto-update update",
      "renovate-auto-update update --level patch --apply"
    ]
  },
  {
    command: CliCommand.Audit,
    label: "Review security vulnerabilities",
    description: "Review npm audit fixes without changing files.",
    usage: "renovate-auto-update audit [options]",
    supportsApply: true,
    examples: [
      "renovate-auto-update audit",
      "renovate-auto-update audit --min-severity moderate --apply"
    ]
  },
  {
    command: CliCommand.Check,
    label: "Check maintenance policy",
    description: "Fail with exit code 2 when required maintenance is found.",
    usage: "renovate-auto-update check [options]",
    supportsApply: false,
    examples: [
      "renovate-auto-update check",
      "renovate-auto-update check --level major --min-severity high"
    ]
  },
  {
    command: CliCommand.Pin,
    label: "Preview pinned versions",
    description: "Preview exact dependency versions without changing files.",
    usage: "renovate-auto-update pin [options]",
    supportsApply: true,
    examples: [
      "renovate-auto-update pin --no-update",
      "renovate-auto-update pin --apply"
    ]
  },
  {
    command: CliCommand.About,
    label: "About",
    description: "Show tool purpose and compatibility details.",
    usage: "renovate-auto-update about",
    supportsApply: false,
    examples: ["renovate-auto-update about"]
  },
  {
    command: CliCommand.Completion,
    label: "Shell completion",
    description: "Print completion script for bash, zsh, or fish.",
    usage: "renovate-auto-update completion <shell>",
    supportsApply: false,
    examples: ["renovate-auto-update completion zsh"]
  }
]

export const GLOBAL_OPTIONS: readonly CliOptionDefinition[] = [
  {
    flags: "-C, --cwd <path>",
    description: "Target directory containing package.json."
  },
  {
    flags: "--json",
    description: "Write one machine-readable result to stdout."
  },
  {
    flags: "-v, --verbose",
    description: "Show every skipped package and its reason."
  },
  {
    flags: "--color <auto|always|never>",
    description: "Control terminal color output."
  },
  {
    flags: "--no-color",
    description: "Alias for --color never."
  },
  {
    flags: "-h, --help",
    description: "Show general or command-specific help."
  },
  {
    flags: "-V, --version",
    description: "Print installed CLI version."
  }
]

export const COMMAND_OPTIONS: readonly CliOptionDefinition[] = [
  {
    flags: "--level <patch|minor|major>",
    description: "Maximum update level. Default: minor.",
    commands: [CliCommand.Update, CliCommand.Check, CliCommand.Pin]
  },
  {
    flags: "-n, --dry-run",
    description: "Preview changes. This is the default.",
    commands: [CliCommand.Update, CliCommand.Audit, CliCommand.Pin]
  },
  {
    flags: "-y, --apply",
    description: "Write reviewed changes to package.json.",
    commands: [CliCommand.Update, CliCommand.Audit, CliCommand.Pin]
  },
  {
    flags: "--fix",
    description: "Deprecated alias for --apply.",
    commands: [CliCommand.Update, CliCommand.Audit, CliCommand.Pin]
  },
  {
    flags: "--skip <pkg1,pkg2,...>",
    description: "Skip packages. May be repeated.",
    commands: [CliCommand.Update, CliCommand.Pin]
  },
  {
    flags: "--no-update",
    description: "Pin current versions only; requires pin command.",
    commands: [CliCommand.Pin]
  },
  {
    flags: "--min-severity <level>",
    description: "Minimum severity: critical, high, moderate, low, or info.",
    commands: [CliCommand.Audit, CliCommand.Check]
  },
  {
    flags: "--show-dep-chain",
    description: "Show chains for indirect audit vulnerabilities.",
    commands: [CliCommand.Audit]
  }
]

export const getCommandDefinition = (
  command: CliCommand
): CliCommandDefinition => {
  const definition = COMMAND_DEFINITIONS.find(
    candidate => candidate.command === command
  )

  if (!definition) {
    throw new Error(`Unknown command: ${command}`)
  }

  return definition
}

export const getOperationCommands = (): readonly CliCommand[] => [
  CliCommand.Update,
  CliCommand.Audit,
  CliCommand.Check,
  CliCommand.Pin
]
