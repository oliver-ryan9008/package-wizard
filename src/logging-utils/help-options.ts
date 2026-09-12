import {
  COMMAND_DEFINITIONS,
  COMMAND_OPTIONS,
  GLOBAL_OPTIONS,
  getCommandDefinition
} from "../cli-definition"
import { CliCommand, CliOptions } from "../types"
import {
  formatColumns,
  generalLogger,
  infoLogger,
  successLogger
} from "./logger"

const operationCommands = COMMAND_DEFINITIONS.filter(
  definition =>
    definition.command === CliCommand.Update ||
    definition.command === CliCommand.Audit ||
    definition.command === CliCommand.Check ||
    definition.command === CliCommand.Pin
)

const printSection = (title: string): void => {
  generalLogger("")
  infoLogger(title)
}

const printExamples = (examples: readonly string[]): void => {
  printSection("Examples")
  generalLogger(examples.map(example => `  ${example}`).join("\n"))
}

const commandOptions = (command: CliCommand) =>
  COMMAND_OPTIONS.filter(option => option.commands?.includes(command))

const formatOptions = (options: readonly (typeof GLOBAL_OPTIONS)[number][]) =>
  formatColumns(
    options.map(option => ({
      label: option.flags,
      description: option.description
    }))
  )

export const printHelp = (command?: CliCommand): void => {
  if (
    command &&
    command !== CliCommand.About &&
    command !== CliCommand.Completion
  ) {
    const definition = getCommandDefinition(command)
    successLogger("Package Wizard")
    generalLogger("")
    infoLogger(`Usage: ${definition.usage}`)
    generalLogger(`  ${definition.description}`)

    printSection("Options")
    generalLogger(
      formatOptions([...commandOptions(command), ...GLOBAL_OPTIONS])
    )
    printExamples(definition.examples)

    if (definition.supportsApply) {
      printSection("Safety")
      generalLogger("  Preview is default. Use --apply only after review.")
    }

    return
  }

  successLogger("Package Wizard")
  generalLogger("  Preview dependency maintenance. Apply only after review.")
  generalLogger("")
  infoLogger("Usage: package-wizard <command> [options]")
  generalLogger("  Run without a command to use guided interactive mode.")

  printSection("Commands")
  generalLogger(
    formatColumns(
      COMMAND_DEFINITIONS.map(definition => ({
        label:
          definition.command === CliCommand.Completion
            ? "completion <shell>"
            : definition.command,
        description: definition.description
      }))
    )
  )

  printSection("Global options")
  generalLogger(formatOptions(GLOBAL_OPTIONS))

  printSection("Quick start")
  generalLogger(
    [
      "  package-wizard update",
      "  package-wizard audit",
      "  package-wizard check",
      "  package-wizard update --apply"
    ].join("\n")
  )

  printSection("Compatibility")
  generalLogger(
    "  Legacy --audit, --pin, and --mandatory-update-check flags remain supported."
  )
}

export const aboutHelp = (): void => {
  successLogger("Package Wizard")
  generalLogger("")
  generalLogger(
    "  Preview dependency updates, audit fixes, and maintenance policy checks."
  )
  generalLogger(
    "  Renovate rules are read from renovate.json before any change is considered."
  )
  generalLogger("")
  infoLogger("Use package-wizard --help for commands and examples.")
}

export const generalHelpBanner = (): void => {
  printHelp()
}

export const updateHelp = (): void => {
  printHelp(CliCommand.Update)
}

export const auditHelp = (): void => {
  printHelp(CliCommand.Audit)
}

export const mandatoryUpdateLevelHelp = (): void => {
  printHelp(CliCommand.Check)
}

export const pinHelp = (): void => {
  printHelp(CliCommand.Pin)
}

export const dryRunHelp = (): void => {
  updateHelp()
}

export const fixHelp = (): void => {
  updateHelp()
}

export const checkForHelpOptions = (options: CliOptions): boolean => {
  if (!options.help) {
    return false
  }

  printHelp(options.command)
  return true
}

export const getInteractiveHelpCommands = (): readonly CliCommand[] =>
  operationCommands.map(definition => definition.command)
