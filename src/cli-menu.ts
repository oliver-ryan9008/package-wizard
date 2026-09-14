import { SelectPrompt, wrapTextWithPrefix } from "@clack/core"
import {
  cancel,
  formatInstructionFooter,
  intro,
  isCancel,
  limitOptions,
  S_BAR,
  S_BAR_END,
  SELECT_INSTRUCTIONS,
  settings,
  symbol,
  symbolBar,
  text
} from "@clack/prompts"
import { existsSync } from "node:fs"
import path from "node:path"
import { styleText } from "node:util"
import { getCommandDefinition } from "./cli-definition"
import { aboutHelp, generalHelpBanner } from "./logging-utils/help-options"
import { generalLogger, infoLogger } from "./logging-utils/logger"
import { CliCommand, Shell, UpdateLevel, VulnerabilitySeverity } from "./types"

type MenuAction = CliCommand | "target" | "help" | "back" | "exit"
type BackAction = "back"
export type PreviewAction = boolean | "details" | null

const backOption = { value: "back" as const, label: "← Go back" }

type SelectOption<Value> = {
  value: Value
  label?: string
  hint?: string
  disabled?: boolean
}

type SelectOptions<Value> = {
  message: string
  options: SelectOption<Value>[]
  initialValue?: Value
  maxItems?: number
  showInstructions?: boolean
}

const renderOption = <Value>(
  option: SelectOption<Value> | undefined,
  state: "active" | "cancelled" | "disabled" | "inactive" | "selected"
): string => {
  if (option === undefined) return ""

  const label = option.label ?? String(option.value)

  if (state === "disabled") {
    return `${styleText("gray", "○")} ${styleText("gray", label)}${option.hint ? ` ${styleText("dim", `(${option.hint})`)}` : ""}`
  }

  if (state === "selected") return styleText("dim", label)
  if (state === "cancelled") {
    return styleText(["strikethrough", "dim"], label)
  }

  if (state === "active") {
    return `${styleText("green", "◆")} ${label}${option.hint ? ` ${styleText("dim", `(${option.hint})`)}` : ""}`
  }

  return `${styleText("dim", "○")} ${styleText("dim", label)}`
}

const selectWithDiamond = <Value>(
  options: SelectOptions<Value>
): Promise<Value | symbol> => {
  const showInstructions = options.showInstructions ?? true

  return new SelectPrompt({
    options: options.options,
    initialValue: options.initialValue,
    render() {
      const withGuide = settings.withGuide
      const promptPrefix = `${symbol(this.state)}  `
      const guidePrefix = `${symbolBar(this.state)}  `
      const heading = wrapTextWithPrefix(
        undefined,
        options.message,
        guidePrefix,
        promptPrefix
      )
      const output = `${withGuide ? `${styleText("gray", S_BAR)}\n` : ""}${heading}\n`

      if (this.state === "submit" || this.state === "cancel") {
        const prefix = withGuide ? `${styleText("gray", S_BAR)}  ` : ""
        const state = this.state === "submit" ? "selected" : "cancelled"
        return `${output}${wrapTextWithPrefix(
          undefined,
          renderOption(this.options[this.cursor], state),
          prefix
        )}${this.state === "cancel" && withGuide ? `\n${styleText("gray", S_BAR)}` : ""}`
      }

      const prefix = withGuide ? `${styleText("cyan", S_BAR)}  ` : ""
      const headingLineCount = output.split("\n").length
      const footer = showInstructions
        ? formatInstructionFooter(SELECT_INSTRUCTIONS, withGuide)
        : withGuide
          ? [styleText("cyan", S_BAR_END)]
          : []
      const footerText = footer.join("\n")

      return `${output}${prefix}${limitOptions({
        output: process.stdout,
        cursor: this.cursor,
        options: this.options,
        maxItems: options.maxItems,
        columnPadding: prefix.length,
        rowPadding: headingLineCount + footer.length + 1,
        style: (option, active) =>
          renderOption(
            option,
            option.disabled ? "disabled" : active ? "active" : "inactive"
          )
      }).join(`\n${prefix}`)}\n${footerText}\n`
    }
  }).prompt() as Promise<Value | symbol>
}

const menuOptions: Array<{
  value: MenuAction
  label: string
  hint?: string
}> = [
  {
    value: CliCommand.Update,
    label: "Preview dependency updates (Default)",
    hint: "Recommended. No files change."
  },
  {
    value: CliCommand.Audit,
    label: "Review security vulnerabilities",
    hint: "Preview available fixes."
  },
  {
    value: CliCommand.Check,
    label: "Check maintenance policy",
    hint: "For CI and release gates."
  },
  {
    value: CliCommand.Pin,
    label: "Pin Versions",
    hint: "Review exact version ranges."
  },
  { value: "target", label: "Change target project" },
  { value: "help", label: "Help and examples" },
  { value: CliCommand.About, label: "About" },
  { value: "exit", label: "Exit", hint: "Leave without making changes." }
]

const updateLevelOptions = [
  {
    value: UpdateLevel.Patch,
    label: "Patch updates only",
    hint: "Lowest risk."
  },
  {
    value: UpdateLevel.Minor,
    label: "Minor and patch updates (Default)",
    hint: "Recommended."
  },
  {
    value: UpdateLevel.Major,
    label: "Major, minor, and patch updates",
    hint: "Review breaking changes carefully."
  }
]

const severityOptions = [
  {
    value: VulnerabilitySeverity.High,
    label: "High and critical",
    hint: "Recommended."
  },
  { value: VulnerabilitySeverity.Critical, label: "Critical only" },
  { value: VulnerabilitySeverity.Moderate, label: "Moderate and above" },
  { value: VulnerabilitySeverity.Low, label: "Low and above" },
  { value: VulnerabilitySeverity.Info, label: "All severities" }
]

const resolveTargetDirectory = (value: string): string => {
  const resolvedPath = path.resolve(value.trim())
  return path.basename(resolvedPath) === "package.json"
    ? path.dirname(resolvedPath)
    : resolvedPath
}

const targetPackageJsonPath = (targetDirectory: string): string =>
  path.join(targetDirectory, "package.json")

const displayTargetPath = (targetDirectory: string): string => {
  const packagePath = targetPackageJsonPath(targetDirectory)
  const relativeToHome = path.relative(process.env.HOME ?? "", packagePath)

  return relativeToHome && !relativeToHome.startsWith("..")
    ? `~/${relativeToHome}`
    : packagePath
}

const isPromptCancelled = (value: unknown): boolean => isCancel(value)

const promptForUpdateLevel = async (): Promise<
  UpdateLevel | BackAction | null
> => {
  const selected = await selectWithDiamond({
    message: "Choose update scope",
    initialValue: UpdateLevel.Minor,
    options: [...updateLevelOptions, backOption]
  })

  if (isPromptCancelled(selected)) {
    cancel("Update selection cancelled.")
    return null
  }

  return selected as UpdateLevel | BackAction
}

const promptForSkippedPackages = async (): Promise<string | null> => {
  const skippedPackages = await text({
    message: "Packages to skip (optional, comma-separated)",
    initialValue: ""
  })

  if (isPromptCancelled(skippedPackages)) {
    cancel("Update selection cancelled.")
    return null
  }

  return (skippedPackages as string).trim()
}

const promptForUpdate = async (): Promise<string[] | BackAction | null> => {
  const level = await promptForUpdateLevel()
  if (level === null) return null
  if (level === "back") return "back"

  const skippedPackages = await promptForSkippedPackages()
  if (skippedPackages === null) return null

  return [
    CliCommand.Update,
    "--level",
    level,
    ...(skippedPackages ? ["--skip", skippedPackages] : [])
  ]
}

const promptForAudit = async (): Promise<string[] | BackAction | null> => {
  const severity = await selectWithDiamond({
    message: "Choose minimum vulnerability severity",
    initialValue: VulnerabilitySeverity.High,
    options: [
      ...severityOptions.map(option =>
        option.value === VulnerabilitySeverity.High
          ? { ...option, label: `${option.label} (Default)` }
          : option
      ),
      backOption
    ]
  })

  if (isPromptCancelled(severity)) {
    cancel("Audit selection cancelled.")
    return null
  }
  if (severity === "back") return "back"

  const includeDependencyChains = await selectWithDiamond({
    message: "Show indirect dependency chains?",
    initialValue: false,
    options: [
      {
        value: false,
        label: "No (Default)",
        hint: "Keep report compact."
      },
      {
        value: true,
        label: "Yes",
        hint: "Show where indirect issues come from."
      },
      backOption
    ] as Array<{ value: boolean | BackAction; label: string; hint?: string }>
  })

  if (isPromptCancelled(includeDependencyChains)) {
    cancel("Audit selection cancelled.")
    return null
  }
  if (includeDependencyChains === "back") return "back"

  return [
    CliCommand.Audit,
    "--min-severity",
    severity as VulnerabilitySeverity,
    ...(includeDependencyChains ? ["--show-dep-chain"] : [])
  ]
}

const promptForCheck = async (): Promise<string[] | BackAction | null> => {
  const level = await promptForUpdateLevel()
  if (level === null) return null
  if (level === "back") return "back"

  const auditSeverity = await selectWithDiamond({
    message: "Include vulnerability policy?",
    initialValue: "none",
    options: [
      {
        value: "none",
        label: "No (Default)",
        hint: "Check dependency updates only."
      },
      ...severityOptions.map(option => ({
        value: option.value,
        label: option.label,
        hint: option.hint
      })),
      backOption
    ]
  })

  if (isPromptCancelled(auditSeverity)) {
    cancel("Check selection cancelled.")
    return null
  }
  if (auditSeverity === "back") return "back"

  return [
    CliCommand.Check,
    "--level",
    level,
    ...(auditSeverity === "none"
      ? []
      : ["--min-severity", auditSeverity as VulnerabilitySeverity])
  ]
}

const promptForPin = async (): Promise<string[] | BackAction | null> => {
  const selected = await selectWithDiamond({
    message: "Choose pin behavior",
    initialValue: "current",
    options: [
      {
        value: "current",
        label: "Pin current versions only (Default)",
        hint: "No version updates."
      },
      {
        value: "latest",
        label: "Pin latest eligible versions",
        hint: "Also checks for updates."
      },
      backOption
    ]
  })

  if (isPromptCancelled(selected)) {
    cancel("Pin selection cancelled.")
    return null
  }
  if (selected === "back") return "back"

  if (selected === "current") {
    return [CliCommand.Pin, "--no-update"]
  }

  const level = await promptForUpdateLevel()
  if (level === null) return null
  if (level === "back") return "back"

  const skippedPackages = await promptForSkippedPackages()
  if (skippedPackages === null) return null

  return [
    CliCommand.Pin,
    "--level",
    level,
    ...(skippedPackages ? ["--skip", skippedPackages] : [])
  ]
}

const promptForTargetDirectory = async (
  targetDirectory: string
): Promise<string | null> => {
  const enteredPath = await text({
    message: "Path to package.json or its directory",
    initialValue: targetPackageJsonPath(targetDirectory),
    validate: (value: string | undefined) => {
      if (!value?.trim()) {
        return "Path is required"
      }

      const candidate = targetPackageJsonPath(resolveTargetDirectory(value))
      return existsSync(candidate)
        ? undefined
        : `Could not find package.json at ${candidate}`
    }
  })

  if (isPromptCancelled(enteredPath)) {
    cancel("Target project selection cancelled.")
    return null
  }

  return resolveTargetDirectory(enteredPath as string)
}

export const promptForApply = async (
  command: CliCommand,
  changeCount: number,
  skippedCount = 0
): Promise<PreviewAction> => {
  const definition = getCommandDefinition(command)
  const selected = await selectWithDiamond({
    message: `${changeCount} ${changeCount === 1 ? "change" : "changes"} ready for ${definition.command}`,
    initialValue: false,
    options: [
      {
        value: false,
        label: "Keep preview (Default)",
        hint: "No files change."
      },
      {
        value: true,
        label: "Apply changes",
        hint: "Writes package.json."
      },
      ...(skippedCount > 0
        ? [
            {
              value: "details" as const,
              label: "Show skipped reasons",
              hint: "View why packages were not changed."
            }
          ]
        : []),
      backOption
    ] as Array<{
      value: boolean | "details" | BackAction
      label: string
      hint?: string
    }>
  })

  if (isPromptCancelled(selected)) {
    cancel("Changes were not applied.")
    return null
  }

  if (selected === "back") return null

  return selected as boolean | "details"
}

export const promptForCommand = async (): Promise<string[] | null> => {
  let targetDirectory = process.cwd()
  const packageJsonPath = targetPackageJsonPath(targetDirectory)

  if (!existsSync(packageJsonPath)) {
    throw new Error(
      `No package.json found in ${targetDirectory}. Run this command from a Node.js project or use an explicit command with --cwd <project-directory>.`
    )
  }

  intro("Package Wizard")

  while (true) {
    infoLogger(`Target: ${displayTargetPath(targetDirectory)}`)
    generalLogger("Preview first. Changes will only be applied after review.")

    const selected = await selectWithDiamond({
      message: "Choose a task",
      initialValue: CliCommand.Update,
      options: menuOptions
    })

    if (isPromptCancelled(selected)) {
      cancel("Operation cancelled.")
      return null
    }

    if (selected === "exit") {
      return null
    }

    if (selected === "back") {
      return null
    }

    if (selected === "target") {
      const nextTargetDirectory =
        await promptForTargetDirectory(targetDirectory)
      if (nextTargetDirectory === null) return null
      targetDirectory = nextTargetDirectory
      continue
    }

    if (selected === "help") {
      generalHelpBanner()
      continue
    }

    if (selected === CliCommand.About) {
      aboutHelp()
      continue
    }

    let args: string[] | BackAction | null

    if (selected === CliCommand.Update) {
      args = await promptForUpdate()
    } else if (selected === CliCommand.Audit) {
      args = await promptForAudit()
    } else if (selected === CliCommand.Check) {
      args = await promptForCheck()
    } else if (selected === CliCommand.Pin) {
      args = await promptForPin()
    } else {
      return null
    }

    if (args === null) return null
    if (args === "back") continue
    return [...args, "--cwd", targetDirectory]
  }
}

export const shellCompletionOptions = Object.values(Shell)
