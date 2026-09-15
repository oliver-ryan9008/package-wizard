import {
  updatePackageJsonDependencies as updatePackageJsonDependenciesImpl,
  hasMandatoryUpdates
} from "../utils/update-utils"
import {
  fixVulnerabilities as fixVulnerabilitiesImpl,
  getDependencyChain
} from "../utils/audit-utils"
import {
  CliCommand,
  CliOptions,
  ColorMode,
  UpdateLevel,
  MandatoryUpdateCheckResult,
  VulnerabilitySeverity,
  VulnerabilityFixResult,
  UpdateResult
} from "../types"
import {
  errorBanner,
  errorLogger,
  infoLogger,
  logObj,
  setColorMode,
  warnLogger
} from "../logging-utils/logger"
import { aboutHelp, checkForHelpOptions } from "../logging-utils/help-options"
import {
  promptForAcknowledge,
  promptForApply,
  promptForCommand,
  type InteractiveConfigCache
} from "../cli-menu"
import {
  printAuditResult,
  printMandatoryCheckResult,
  printOperationHeader,
  printPeerDependencyCheckResult,
  printShellCompletion,
  printUpdateResult
} from "../cli-ui"
import { checkProjectPeerDependencies } from "../utils/peer-utils"
import { parseArgs } from "./args-parser"
import projectPackageJson from "../../package.json"
import { readDependencyConfig } from "../utils/file-utils"

export interface CliDependencies {
  updatePackageJsonDependencies: typeof updatePackageJsonDependenciesImpl
  fixVulnerabilities: typeof fixVulnerabilitiesImpl
}

export const defaultDependencies: CliDependencies = {
  updatePackageJsonDependencies: updatePackageJsonDependenciesImpl,
  fixVulnerabilities: fixVulnerabilitiesImpl
}

export const runAudit = async (
  options: CliOptions,
  dependencies: CliDependencies = defaultDependencies
): Promise<VulnerabilityFixResult> => {
  const config = options.dependencyConfig !== undefined
    ? options.dependencyConfig
    : await readDependencyConfig(options.cwd ?? process.cwd(), { log: options.configLog })
  const minSeverity = options.minSeverity ?? config?.audit?.minSeverity
  const showDepChain = options.showDepChain ?? config?.audit?.showDepChain ?? false
  const result = await dependencies.fixVulnerabilities({
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    minSeverity,
    dryRun: options.dryRun ?? true,
    ...(options.json ? { quiet: true } : {}),
    ...(options.configLog === undefined ? {} : { configLog: options.configLog }),
    ...(options.dependencyConfig === undefined ? {} : { dependencyConfig: config })
  })

  if (options.json) {
    logObj(result)
    return result
  }

  if (showDepChain) {
    const cwd = options.cwd ?? process.cwd()
    const dependencyChainCache = new Map<string, Promise<string | null>>()
    await Promise.all(
      result.vulnerabilities
        .filter(vulnerability => !vulnerability.isDirect)
        .map(async vulnerability => {
          const cachedChain = dependencyChainCache.get(vulnerability.name)
          const chain =
            vulnerability.dependencyChain ??
            cachedChain ??
            (() => {
              const chainPromise = getDependencyChain(vulnerability.name, cwd)
              dependencyChainCache.set(vulnerability.name, chainPromise)
              return chainPromise
            })()
          const resolvedChain = await chain
          if (resolvedChain) vulnerability.dependencyChain = resolvedChain
        })
    )
  }

  printAuditResult(result, options)
  return result
}

const reportCliError = (message: string, json: boolean): Error => {
  if (json) {
    process.stderr.write(`${JSON.stringify({ error: message, code: "CLI_ERROR" })}\n`)
    return new Error(message)
  }
  errorLogger(`Error: ${message}`)
  errorLogger("Run package-wizard --help for usage.")
  errorBanner()
  return new Error(message)
}

export const runMandatoryUpdatesCheck = async (
  optionsFromCli?: CliOptions
): Promise<MandatoryUpdateCheckResult | Error> => {
  const options = optionsFromCli ?? parseArgs(process.argv.slice(2))
  try {
    const config = options.dependencyConfig !== undefined
      ? options.dependencyConfig
      : await readDependencyConfig(options.cwd ?? process.cwd(), { log: options.configLog })
    const requiredUpdateLevel: UpdateLevel = options.level ?? config?.mandatoryUpdates?.level ?? UpdateLevel.Minor
    const auditCheckLevel: VulnerabilitySeverity | undefined = options.minSeverity ?? config?.mandatoryUpdates?.minSeverity
    const result = await hasMandatoryUpdates(requiredUpdateLevel, auditCheckLevel, {
      ...options,
      apply: false,
      fix: false,
      dryRun: true,
      ...(options.json ? { quiet: true } : {}),
      ...(options.configLog === undefined ? {} : { configLog: options.configLog }),
      ...(options.dependencyConfig === undefined ? {} : { dependencyConfig: config })
    })
    if (options.json) {
      logObj(result)
      return result
    }
    printMandatoryCheckResult(result)
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return reportCliError(message, options.json ?? false)
  }
}

const runUpdate = async (options: CliOptions, dependencies: CliDependencies): Promise<UpdateResult> => {
  const dependencyConfig = options.checkPeerDeps
    ? {
        ...(options.dependencyConfig ?? {}),
        peerDependencies: {
          ...(options.dependencyConfig?.peerDependencies ?? {}),
          strategy: "strict" as const
        }
      }
    : options.dependencyConfig
  const result = await dependencies.updatePackageJsonDependencies({
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    level: options.level,
    dryRun: options.dryRun,
    pin: options.pin,
    noUpdate: options.noUpdate,
    skip: options.skip,
    ...(options.json ? { quiet: true } : {}),
    ...(options.configLog === undefined ? {} : { configLog: options.configLog }),
    ...(dependencyConfig === undefined
      ? {}
      : { dependencyConfig })
  })
  if (options.json) {
    logObj(result)
    return result
  }
  printUpdateResult(result, options)
  return result
}

const maybeApplyInteractivePreview = async (
  interactive: boolean,
  command: CliCommand,
  options: CliOptions,
  changeCount: number,
  skippedCount: number,
  showSkippedReasons: () => void,
  apply: (nextOptions: CliOptions) => Promise<void>
): Promise<void> => {
  if (!interactive || options.json || !options.dryRun || changeCount === 0) return
  while (true) {
    const action = await promptForApply(command, changeCount, skippedCount)
    if (action === "details") {
      showSkippedReasons()
      continue
    }
    if (!action) return
    infoLogger("Rechecking before apply...")
    await apply({ ...options, apply: true, dryRun: false, fix: false })
    return
  }
}

export const run = async (
  dependencies: CliDependencies = defaultDependencies
): Promise<void | MandatoryUpdateCheckResult | Error> => {
  const cliArgs = process.argv.slice(2)
  const interactive = cliArgs.length === 0
  const configCache: InteractiveConfigCache = new Map()
  try {
    while (true) {
      if (interactive && (process.stdin.isTTY === false || process.stdout.isTTY === false)) {
        throw new Error("Interactive mode requires a TTY. Pass a command or --help.")
      }
      const selectedArgs = interactive
        ? await promptForCommand(configCache)
        : cliArgs
      if (selectedArgs === null) return
      const parsedOptions = parseArgs(selectedArgs)
      const options = {
        ...parsedOptions,
        configLog: !interactive,
        dependencyConfig: interactive
          ? configCache.get(parsedOptions.cwd ?? process.cwd())?.config ?? null
          : undefined
      }
      setColorMode(options.color ?? ColorMode.Auto)
      const updaterVersion = projectPackageJson.version ?? "unknown"
      if (options.version) {
        process.stdout.write(`${updaterVersion}\n`)
        return
      }
      if (checkForHelpOptions(options)) {
        if (!interactive) return
        continue
      }
      const command = options.command
      if (!command) throw new Error("Choose a command or run without arguments for guided mode.")
      if (command === CliCommand.About) {
        aboutHelp()
        if (!interactive) return
        continue
      }
      if (command === CliCommand.Completion) {
        printShellCompletion(options.completion ?? "")
        return
      }
      if (options.fix && !options.json) warnLogger("--fix is deprecated. Use --apply instead.")
      if (!options.json) printOperationHeader(updaterVersion, command, options)
      if (command === CliCommand.Check) {
        const result = await runMandatoryUpdatesCheck(options)
        if (!interactive) return result
        if (!(await promptForAcknowledge())) continue
        continue
      }
      if (command === CliCommand.PeerCheck) {
        const result = await checkProjectPeerDependencies(options.cwd ?? process.cwd())
        if (options.json) {
          logObj(result)
          return
        }
        printPeerDependencyCheckResult(result)
        if (!interactive) return
        if (!(await promptForAcknowledge())) continue
        continue
      }
      if (command === CliCommand.Audit) {
        const result = await runAudit(options, dependencies)
        await maybeApplyInteractivePreview(interactive, command, options, result.fixed.length, result.skipped.length, () => printAuditResult(result, { ...options, verbose: true }), async applyOptions => { await runAudit(applyOptions, dependencies) })
        if (!interactive) return
        if (!(await promptForAcknowledge())) continue
        continue
      }
      const result = await runUpdate(options, dependencies)
      await maybeApplyInteractivePreview(interactive, command, options, result.updated.length, result.skipped.length + result.configExcluded.length + (result.releaseAgeWarnings?.length ?? 0) + (result.releaseAgeErrors?.length ?? 0), () => printUpdateResult(result, { ...options, verbose: true }), async applyOptions => { await runUpdate(applyOptions, dependencies) })
      if (!interactive) return
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const reportedError = reportCliError(message, cliArgs.includes("--json"))
    process.exitCode = 1
    return reportedError
  }
}
