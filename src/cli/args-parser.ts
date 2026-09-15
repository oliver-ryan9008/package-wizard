import {
  CliCommand,
  CliOptions,
  ColorMode,
  Shell,
  UpdateLevel,
  UPDATE_LEVELS,
  VULNERABILITY_SEVERITIES
} from "../types"
import { getCommandDefinition } from "../cli-definition"
import { isVulnerabilitySeverity } from "../utils/generic-utils"

export const isUpdateLevel = (value: string): value is UpdateLevel =>
  UPDATE_LEVELS.includes(value as UpdateLevel)

export const isCliCommand = (value: string): value is CliCommand =>
  Object.values(CliCommand).includes(value as CliCommand)

const isColorMode = (value: string): value is ColorMode =>
  Object.values(ColorMode).includes(value as ColorMode)

const isShell = (value: string): value is Shell =>
  Object.values(Shell).includes(value as Shell)

export const getRequiredValue = (
  argv: string[],
  index: number,
  optionName: string
): string => {
  const value = argv[index]
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${optionName}`)
  }
  return value
}

export const parseOptionValue = (
  arg: string,
  argv: string[],
  index: number,
  optionName: string
): { value: string; consumedNextArg: boolean } => {
  const inlinePrefix = `${optionName}=`
  if (arg.startsWith(inlinePrefix)) {
    const value = arg.slice(inlinePrefix.length)
    if (!value) throw new Error(`Missing value for ${optionName}`)
    return { value, consumedNextArg: false }
  }
  return { value: getRequiredValue(argv, index + 1, optionName), consumedNextArg: true }
}

interface ParseState {
  hasMeaningfulArgument: boolean
  dryRunRequested: boolean
  colorWasSet: boolean
  levelWasSet: boolean
}

const setCommand = (options: CliOptions, command: CliCommand, source: string): void => {
  if (options.command && options.command !== command) {
    throw new Error(`Cannot combine ${source} with ${options.command} command. Choose one command.`)
  }
  options.command = command
  if (command === CliCommand.Audit) options.audit = true
  if (command === CliCommand.Check) options.mandatoryUpdateCheck = true
  if (command === CliCommand.Pin) options.pin = true
}

const editDistance = (left: string, right: string): number => {
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0)
  )
  for (let index = 0; index <= left.length; index += 1) matrix[index][0] = index
  for (let index = 0; index <= right.length; index += 1) matrix[0][index] = index
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      matrix[leftIndex][rightIndex] = Math.min(
        (matrix[leftIndex - 1][rightIndex] ?? 0) + 1,
        (matrix[leftIndex][rightIndex - 1] ?? 0) + 1,
        (matrix[leftIndex - 1][rightIndex - 1] ?? 0) + substitutionCost
      )
    }
  }
  return matrix[left.length][right.length] ?? Number.POSITIVE_INFINITY
}

const findSuggestion = (value: string, candidates: readonly string[]): string | undefined => {
  const nearest = candidates
    .map(candidate => ({ candidate, distance: editDistance(value, candidate) }))
    .sort((left, right) => left.distance - right.distance)[0]
  if (!nearest || nearest.distance > Math.max(2, value.length / 3)) return undefined
  return nearest.candidate
}

type ArgumentHandler = (options: CliOptions, state: ParseState) => void

const flagHandlers: Record<string, ArgumentHandler> = {
  "--help": options => { options.help = true },
  "-h": options => { options.help = true },
  "--mandatory-update-check": options => { setCommand(options, CliCommand.Check, "--mandatory-update-check") },
  "--pin": options => { setCommand(options, CliCommand.Pin, "--pin") },
  "--no-update": options => { options.noUpdate = true },
  "--check-peer-deps": options => { options.checkPeerDeps = true },
  "--dry-run": (_options, state) => { state.dryRunRequested = true },
  "-n": (_options, state) => { state.dryRunRequested = true },
  "--apply": options => { options.apply = true },
  "-y": options => { options.apply = true },
  "--fix": options => { options.fix = true; options.apply = true },
  "--audit": options => { setCommand(options, CliCommand.Audit, "--audit") },
  "--json": options => { options.json = true },
  "--show-dep-chain": options => { options.showDepChain = true },
  "-v": options => { options.verbose = true },
  "--verbose": options => { options.verbose = true },
  "--no-color": (options, state) => {
    if (state.colorWasSet && options.color !== ColorMode.Never) throw new Error("--no-color cannot be combined with --color")
    options.color = ColorMode.Never
    state.colorWasSet = true
  },
  "--version": options => { options.version = true },
  "-V": options => { options.version = true },
  "--about": options => { setCommand(options, CliCommand.About, "--about") }
}

const valueOptionNames = ["--skip", "--cwd", "-C", "--level", "--min-severity", "--color"] as const
const knownArguments = [...Object.keys(flagHandlers), ...valueOptionNames, ...Object.values(CliCommand), "help"]

const applyValueOption = (
  options: CliOptions,
  option: (typeof valueOptionNames)[number],
  value: string,
  state: ParseState
): void => {
  if (option === "--skip") {
    options.skip?.push(...value.split(",").map(packageName => packageName.trim()).filter(Boolean))
    return
  }
  if (option === "--cwd" || option === "-C") {
    options.cwd = value
    return
  }
  if (option === "--level") {
    if (!isUpdateLevel(value)) throw new Error(`--level must be one of: ${UPDATE_LEVELS.join(", ")}`)
    options.level = value
    state.levelWasSet = true
    return
  }
  if (option === "--min-severity") {
    if (!isVulnerabilitySeverity(value)) throw new Error(`--min-severity must be one of: ${VULNERABILITY_SEVERITIES.join(", ")}`)
    options.minSeverity = value
    return
  }
  if (!isColorMode(value)) throw new Error("--color must be one of: auto, always, never")
  if (state.colorWasSet && options.color !== value) throw new Error("--color cannot be specified more than once")
  options.color = value
  state.colorWasSet = true
}

const applyArgument = (arg: string | undefined, argv: string[], index: number, options: CliOptions, state: ParseState): number => {
  if (!arg) return 0
  if (!arg.startsWith("-")) {
    state.hasMeaningfulArgument = true
    if (options.command === CliCommand.Completion && options.completion === undefined) {
      if (!isShell(arg)) throw new Error("completion shell must be one of: bash, zsh, fish")
      options.completion = arg
      return 0
    }
    if (arg === "help") { options.help = true; return 0 }
    if (isCliCommand(arg)) { setCommand(options, arg, arg); return 0 }
    const suggestion = findSuggestion(arg, [...Object.values(CliCommand), "help"])
    throw new Error(`Unknown command: ${arg}${suggestion ? `. Did you mean ${suggestion}?` : ""}`)
  }
  state.hasMeaningfulArgument = true
  const flagHandler = flagHandlers[arg]
  if (flagHandler) { flagHandler(options, state); return 0 }
  const valueOption = valueOptionNames.find(option => arg === option || arg.startsWith(`${option}=`))
  if (!valueOption) {
    const suggestion = findSuggestion(arg, knownArguments)
    throw new Error(`Unknown option: ${arg}${suggestion ? `. Did you mean ${suggestion}?` : ""}`)
  }
  const { value, consumedNextArg } = parseOptionValue(arg, argv, index, valueOption)
  applyValueOption(options, valueOption, value, state)
  return consumedNextArg ? 1 : 0
}

const finalizeOptions = (options: CliOptions, state: ParseState): void => {
  if (state.dryRunRequested && options.apply) throw new Error("--apply cannot be combined with --dry-run")
  options.dryRun = !options.apply
  if (options.command === undefined && state.hasMeaningfulArgument && !options.help && !options.version) setCommand(options, CliCommand.Update, "default update")
  const command = options.command
  if (options.json && (options.help || options.version || command === CliCommand.About || command === CliCommand.Completion)) throw new Error("--json cannot be combined with help, version, about, or completion")
  if (!command) return
  if (command === CliCommand.Completion) {
    if (!options.completion && !options.help) throw new Error("completion requires one shell: bash, zsh, or fish")
    return
  }
  if (command === CliCommand.About) {
    if (options.apply || options.noUpdate || options.showDepChain) throw new Error("about does not accept operation options")
    return
  }
  const definition = getCommandDefinition(command)
  if (options.apply && !definition.supportsApply) throw new Error(`${command} does not modify files; remove --apply`)
  if (options.noUpdate && command !== CliCommand.Pin) throw new Error("--no-update requires the pin command")
  if (options.checkPeerDeps && command !== CliCommand.Update) throw new Error("--check-peer-deps can only be used with update")
  if (options.showDepChain && command !== CliCommand.Audit) throw new Error("--show-dep-chain can only be used with audit")
  if (options.minSeverity !== undefined && command !== CliCommand.Audit && command !== CliCommand.Check) throw new Error("--min-severity can only be used with audit or check")
  if (options.skip !== undefined && options.skip.length > 0 && command !== CliCommand.Update && command !== CliCommand.Pin) throw new Error("--skip can only be used with update or pin")
  if (command === CliCommand.Audit && state.levelWasSet) throw new Error("--level can only be used with update, check, or pin")
}

export const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    level: UpdateLevel.Minor, dryRun: true, apply: false, json: false,
    audit: false, minSeverity: undefined, pin: false, noUpdate: false,
    skip: [], help: false, fix: false, checkPeerDeps: false, showDepChain: undefined, verbose: false,
    color: ColorMode.Auto, version: false
  }
  const state: ParseState = { hasMeaningfulArgument: false, dryRunRequested: false, colorWasSet: false, levelWasSet: false }
  for (let index = 0; index < argv.length; index += 1) index += applyArgument(argv[index], argv, index, options, state)
  finalizeOptions(options, state)
  return options
}
