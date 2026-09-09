import {
  getRequiredValue,
  isCliCommand,
  isUpdateLevel,
  parseArgs,
  parseOptionValue,
  run,
  runAudit,
  runMandatoryUpdatesCheck
} from "./cli"
import { CliDependencies } from "./cli"
import {
  CliCommand,
  CliOptions,
  ColorMode,
  MandatoryUpdateCheckResult,
  UpdateResult,
  VulnerabilityFixResult
} from "./types"
import {
  hasMandatoryUpdates,
  updatePackageJsonDependencies
} from "./utils/update-utils"
import { fixVulnerabilities, getDependencyChain } from "./utils/audit-utils"
import { checkForHelpOptions } from "./logging-utils/help-options"
import {
  errorBanner,
  errorLogger,
  logObj,
  setColorMode,
  warnLogger
} from "./logging-utils/logger"
import { promptForApply, promptForCommand } from "./cli-menu"
import {
  printAuditResult,
  printMandatoryCheckResult,
  printOperationHeader,
  printShellCompletion,
  printUpdateResult
} from "./cli-ui"

jest.mock("./utils/update-utils", () => ({
  updatePackageJsonDependencies: jest.fn(),
  hasMandatoryUpdates: jest.fn()
}))

jest.mock("./utils/audit-utils", () => ({
  fixVulnerabilities: jest.fn(),
  getDependencyChain: jest.fn()
}))

jest.mock("./logging-utils/help-options", () => ({
  aboutHelp: jest.fn(),
  checkForHelpOptions: jest.fn()
}))

jest.mock("./logging-utils/logger", () => ({
  errorBanner: jest.fn(),
  errorLogger: jest.fn(),
  infoLogger: jest.fn(),
  logObj: jest.fn(),
  setColorMode: jest.fn(),
  warnLogger: jest.fn()
}))

jest.mock("./cli-menu", () => ({
  promptForApply: jest.fn(),
  promptForCommand: jest.fn()
}))

jest.mock("./cli-ui", () => ({
  printAuditResult: jest.fn(),
  printMandatoryCheckResult: jest.fn(),
  printOperationHeader: jest.fn(),
  printShellCompletion: jest.fn(),
  printUpdateResult: jest.fn()
}))

const mockedUpdatePackageJsonDependencies =
  updatePackageJsonDependencies as jest.MockedFunction<
    typeof updatePackageJsonDependencies
  >
const mockedFixVulnerabilities = fixVulnerabilities as jest.MockedFunction<
  typeof fixVulnerabilities
>
const mockedHasMandatoryUpdates = hasMandatoryUpdates as jest.MockedFunction<
  typeof hasMandatoryUpdates
>
const mockedGetDependencyChain = getDependencyChain as jest.MockedFunction<
  typeof getDependencyChain
>
const mockedCheckForHelpOptions = checkForHelpOptions as jest.MockedFunction<
  typeof checkForHelpOptions
>
const mockedErrorBanner = errorBanner as jest.MockedFunction<typeof errorBanner>
const mockedErrorLogger = errorLogger as jest.MockedFunction<typeof errorLogger>
const mockedLogObj = logObj as jest.MockedFunction<typeof logObj>
const mockedSetColorMode = setColorMode as jest.MockedFunction<
  typeof setColorMode
>
const mockedWarnLogger = warnLogger as jest.MockedFunction<typeof warnLogger>
const mockedPromptForApply = promptForApply as jest.MockedFunction<
  typeof promptForApply
>
const mockedPromptForCommand = promptForCommand as jest.MockedFunction<
  typeof promptForCommand
>
const mockedPrintAuditResult = printAuditResult as jest.MockedFunction<
  typeof printAuditResult
>
const mockedPrintMandatoryCheckResult =
  printMandatoryCheckResult as jest.MockedFunction<
    typeof printMandatoryCheckResult
  >
const mockedPrintOperationHeader = printOperationHeader as jest.MockedFunction<
  typeof printOperationHeader
>
const mockedPrintShellCompletion = printShellCompletion as jest.MockedFunction<
  typeof printShellCompletion
>
const mockedPrintUpdateResult = printUpdateResult as jest.MockedFunction<
  typeof printUpdateResult
>

const updateResult: UpdateResult = {
  packageJsonPath: "/repo/package.json",
  updated: [],
  skipped: [],
  renovateExcluded: []
}

const auditResult: VulnerabilityFixResult = {
  packageJsonPath: "/repo/package.json",
  vulnerabilities: [],
  fixed: [],
  skipped: []
}

const mandatoryResult: MandatoryUpdateCheckResult = {
  hasMandatoryUpdates: false,
  message: "No mandatory updates found",
  updated: []
}

const createOptions = (command: CliCommand): CliOptions => ({
  command,
  level: "minor",
  dryRun: true,
  apply: false,
  json: false,
  audit: command === CliCommand.Audit,
  pin: command === CliCommand.Pin,
  noUpdate: false,
  skip: [],
  fix: false,
  showDepChain: false,
  verbose: false,
  color: ColorMode.Auto
})

const createDependencies = (): CliDependencies => ({
  updatePackageJsonDependencies: jest.fn().mockResolvedValue(updateResult),
  fixVulnerabilities: jest.fn().mockResolvedValue(auditResult)
})

describe("cli", () => {
  const originalArgv = process.argv
  const originalExitCode = process.exitCode

  beforeEach(() => {
    jest.clearAllMocks()
    process.argv = ["node", "cli.js"]
    process.exitCode = undefined
    mockedCheckForHelpOptions.mockReturnValue(false)
    mockedPromptForCommand.mockResolvedValue([CliCommand.Update])
    mockedPromptForApply.mockResolvedValue(false)
    mockedGetDependencyChain.mockResolvedValue("root -> indirect-package")
    mockedUpdatePackageJsonDependencies.mockResolvedValue(updateResult)
    mockedFixVulnerabilities.mockResolvedValue(auditResult)
    mockedHasMandatoryUpdates.mockResolvedValue(mandatoryResult)
  })

  afterEach(() => {
    process.argv = originalArgv
    process.exitCode = originalExitCode
  })

  describe("argument parsing", () => {
    it("recognizes update levels and command names", () => {
      expect(isUpdateLevel("patch")).toBe(true)
      expect(isUpdateLevel("major")).toBe(true)
      expect(isUpdateLevel("high")).toBe(false)
      expect(isCliCommand("audit")).toBe(true)
      expect(isCliCommand("updates")).toBe(false)
    })

    it("reads required values in both supported syntaxes", () => {
      expect(getRequiredValue(["--cwd", "/repo"], 1, "--cwd")).toBe("/repo")
      expect(() => getRequiredValue(["--cwd"], 1, "--cwd")).toThrow(
        "Missing value for --cwd"
      )
      expect(() => getRequiredValue(["--cwd", "-n"], 1, "--cwd")).toThrow(
        "Missing value for --cwd"
      )
      expect(
        parseOptionValue("--level=patch", ["--level=patch"], 0, "--level")
      ).toEqual({ value: "patch", consumedNextArg: false })
    })

    it("uses preview mode by default for update and legacy audit commands", () => {
      expect(parseArgs(["update"])).toEqual(
        expect.objectContaining({
          command: CliCommand.Update,
          dryRun: true,
          apply: false
        })
      )
      expect(parseArgs(["--audit"])).toEqual(
        expect.objectContaining({
          command: CliCommand.Audit,
          audit: true,
          dryRun: true,
          apply: false
        })
      )
    })

    it("supports explicit apply and the deprecated fix alias", () => {
      expect(parseArgs(["update", "--apply"])).toEqual(
        expect.objectContaining({ dryRun: false, apply: true, fix: false })
      )
      expect(parseArgs(["audit", "--fix"])).toEqual(
        expect.objectContaining({ dryRun: false, apply: true, fix: true })
      )
    })

    it("maps legacy mode flags to named commands", () => {
      expect(parseArgs(["--mandatory-update-check"])).toEqual(
        expect.objectContaining({
          command: CliCommand.Check,
          mandatoryUpdateCheck: true
        })
      )
      expect(parseArgs(["--pin", "--no-update"])).toEqual(
        expect.objectContaining({
          command: CliCommand.Pin,
          pin: true,
          noUpdate: true
        })
      )
    })

    it("supports concise aliases and repeated package skips", () => {
      expect(
        parseArgs([
          "update",
          "-C",
          "/repo",
          "--skip=react,lodash",
          "--skip",
          "express",
          "--color=never"
        ])
      ).toEqual(
        expect.objectContaining({
          cwd: "/repo",
          skip: ["react", "lodash", "express"],
          color: ColorMode.Never
        })
      )
      expect(parseArgs(["update", "-n"])).toEqual(
        expect.objectContaining({ dryRun: true })
      )
      expect(parseArgs(["update", "-y"])).toEqual(
        expect.objectContaining({ dryRun: false, apply: true })
      )
    })

    it("parses command-specific completion output", () => {
      expect(parseArgs(["completion", "zsh"])).toEqual(
        expect.objectContaining({
          command: CliCommand.Completion,
          completion: "zsh"
        })
      )
    })

    it("rejects unsafe and irrelevant option combinations", () => {
      expect(() => parseArgs(["update", "--dry-run", "--apply"])).toThrow(
        "--apply cannot be combined with --dry-run"
      )
      expect(() => parseArgs(["update", "--no-update"])).toThrow(
        "--no-update requires the pin command"
      )
      expect(() => parseArgs(["audit", "--skip", "react"])).toThrow(
        "--skip can only be used with update or pin"
      )
      expect(() => parseArgs(["check", "--apply"])).toThrow(
        "check does not modify files"
      )
      expect(() => parseArgs(["update", "--show-dep-chain"])).toThrow(
        "--show-dep-chain can only be used with audit"
      )
      expect(() => parseArgs(["audit", "--level", "minor"])).toThrow(
        "--level can only be used with update, check, or pin"
      )
      expect(() => parseArgs(["update", "--json", "--help"])).toThrow(
        "--json cannot be combined with help, version, about, or completion"
      )
    })

    it("suggests close command and option names", () => {
      expect(() => parseArgs(["updte"])).toThrow("Did you mean update?")
      expect(() => parseArgs(["update", "--levl", "patch"])).toThrow(
        "Did you mean --level?"
      )
    })
  })

  describe("audit", () => {
    it("renders a preview by default", async () => {
      const options = createOptions(CliCommand.Audit)
      const dependencies = createDependencies()

      await expect(runAudit(options, dependencies)).resolves.toEqual(
        auditResult
      )

      expect(dependencies.fixVulnerabilities).toHaveBeenCalledWith({
        minSeverity: undefined,
        dryRun: true
      })
      expect(mockedPrintAuditResult).toHaveBeenCalledWith(auditResult, options)
    })

    it("keeps JSON output free of human rendering", async () => {
      const options = { ...createOptions(CliCommand.Audit), json: true }
      const dependencies = createDependencies()

      await runAudit(options, dependencies)

      expect(mockedLogObj).toHaveBeenCalledWith(auditResult)
      expect(mockedPrintAuditResult).not.toHaveBeenCalled()
    })

    it("adds requested chains before rendering audit rows", async () => {
      const result: VulnerabilityFixResult = {
        ...auditResult,
        vulnerabilities: [
          {
            name: "indirect-package",
            severity: "high",
            isDirect: false,
            range: "<2.0.0",
            titles: ["Known issue"],
            fixAvailable: false
          }
        ]
      }
      const dependencies = {
        updatePackageJsonDependencies: jest.fn(),
        fixVulnerabilities: jest.fn().mockResolvedValue(result)
      }
      const options = {
        ...createOptions(CliCommand.Audit),
        showDepChain: true,
        cwd: "/repo"
      }

      await runAudit(options, dependencies)

      expect(mockedGetDependencyChain).toHaveBeenCalledWith(
        "indirect-package",
        "/repo"
      )
      expect(result.vulnerabilities[0]?.dependencyChain).toBe(
        "root -> indirect-package"
      )
    })
  })

  describe("maintenance check", () => {
    it("always executes as a read-only check", async () => {
      const options = {
        ...createOptions(CliCommand.Check),
        apply: false,
        dryRun: true
      }

      await expect(runMandatoryUpdatesCheck(options)).resolves.toEqual(
        mandatoryResult
      )

      expect(mockedHasMandatoryUpdates).toHaveBeenCalledWith(
        "minor",
        undefined,
        expect.objectContaining({
          apply: false,
          fix: false,
          dryRun: true
        })
      )
      expect(mockedPrintMandatoryCheckResult).toHaveBeenCalledWith(
        mandatoryResult
      )
    })

    it("writes only JSON in JSON mode", async () => {
      const options = { ...createOptions(CliCommand.Check), json: true }

      await runMandatoryUpdatesCheck(options)

      expect(mockedLogObj).toHaveBeenCalledWith(mandatoryResult)
      expect(mockedPrintMandatoryCheckResult).not.toHaveBeenCalled()
    })
  })

  describe("command dispatch", () => {
    it("runs update as a preview by default", async () => {
      process.argv = ["node", "cli.js", "update"]
      const dependencies = createDependencies()

      await run(dependencies)

      expect(dependencies.updatePackageJsonDependencies).toHaveBeenCalledWith(
        expect.objectContaining({ level: "minor", dryRun: true, pin: false })
      )
      expect(mockedPrintOperationHeader).toHaveBeenCalledWith(
        expect.any(String),
        CliCommand.Update,
        expect.objectContaining({ dryRun: true })
      )
      expect(mockedPrintUpdateResult).toHaveBeenCalledWith(
        updateResult,
        expect.objectContaining({ command: CliCommand.Update })
      )
      expect(mockedSetColorMode).toHaveBeenCalledWith(ColorMode.Auto)
    })

    it("keeps JSON command output free of human renderers", async () => {
      process.argv = ["node", "cli.js", "update", "--json"]
      const dependencies = createDependencies()

      await run(dependencies)

      expect(mockedLogObj).toHaveBeenCalledWith(updateResult)
      expect(mockedPrintOperationHeader).not.toHaveBeenCalled()
      expect(mockedPrintUpdateResult).not.toHaveBeenCalled()
      expect(mockedWarnLogger).not.toHaveBeenCalled()
    })

    it("writes only after explicit apply", async () => {
      process.argv = ["node", "cli.js", "pin", "--apply"]
      const dependencies = createDependencies()

      await run(dependencies)

      expect(dependencies.updatePackageJsonDependencies).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: false, pin: true })
      )
    })

    it("keeps legacy audit safe and warns for legacy fix", async () => {
      process.argv = ["node", "cli.js", "--audit"]
      const dependencies = createDependencies()

      await run(dependencies)

      expect(dependencies.fixVulnerabilities).toHaveBeenCalledWith(
        expect.objectContaining({ dryRun: true })
      )

      process.argv = ["node", "cli.js", "audit", "--fix"]
      await run(dependencies)
      expect(mockedWarnLogger).toHaveBeenCalledWith(
        "--fix is deprecated. Use --apply instead."
      )
    })

    it("stops after help and renders requested shell completion", async () => {
      process.argv = ["node", "cli.js", "audit", "--help"]
      mockedCheckForHelpOptions.mockReturnValueOnce(true)
      const dependencies = createDependencies()

      await run(dependencies)

      expect(dependencies.fixVulnerabilities).not.toHaveBeenCalled()

      process.argv = ["node", "cli.js", "completion", "fish"]
      await run(dependencies)
      expect(mockedPrintShellCompletion).toHaveBeenCalledWith("fish")
    })

    it("lets interactive users apply only after previewing changes", async () => {
      const resultWithChange: UpdateResult = {
        ...updateResult,
        updated: [
          {
            section: "dependencies",
            name: "react",
            from: "^18.0.0",
            to: "^18.1.0"
          }
        ]
      }
      process.argv = ["node", "cli.js"]
      mockedPromptForCommand.mockResolvedValueOnce([CliCommand.Update])
      mockedPromptForApply.mockResolvedValueOnce(true)
      const dependencies = {
        updatePackageJsonDependencies: jest
          .fn()
          .mockResolvedValue(resultWithChange),
        fixVulnerabilities: jest.fn().mockResolvedValue(auditResult)
      }

      await run(dependencies)

      expect(
        dependencies.updatePackageJsonDependencies
      ).toHaveBeenNthCalledWith(1, expect.objectContaining({ dryRun: true }))
      expect(
        dependencies.updatePackageJsonDependencies
      ).toHaveBeenNthCalledWith(2, expect.objectContaining({ dryRun: false }))
    })

    it("shows skipped reasons from the preview without rescanning", async () => {
      const resultWithChange: UpdateResult = {
        ...updateResult,
        updated: [
          {
            section: "dependencies",
            name: "react",
            from: "^18.0.0",
            to: "^18.1.0"
          }
        ],
        skipped: [
          {
            section: "dependencies",
            name: "legacy-package",
            reason: "Skipped via --skip"
          }
        ]
      }
      process.argv = ["node", "cli.js"]
      mockedPromptForCommand.mockResolvedValueOnce([CliCommand.Update])
      mockedPromptForApply
        .mockResolvedValueOnce("details")
        .mockResolvedValueOnce(false)
      const dependencies = {
        updatePackageJsonDependencies: jest
          .fn()
          .mockResolvedValue(resultWithChange),
        fixVulnerabilities: jest.fn().mockResolvedValue(auditResult)
      }

      await run(dependencies)

      expect(dependencies.updatePackageJsonDependencies).toHaveBeenCalledTimes(
        1
      )
      expect(mockedPrintUpdateResult).toHaveBeenNthCalledWith(
        2,
        resultWithChange,
        expect.objectContaining({ verbose: true })
      )
      expect(mockedPromptForApply).toHaveBeenCalledTimes(2)
    })

    it("returns an actionable error instead of terminating process state", async () => {
      process.argv = ["node", "cli.js", "update", "--unknown"]
      const dependencies = createDependencies()

      await expect(run(dependencies)).resolves.toBeInstanceOf(Error)

      expect(mockedErrorLogger).toHaveBeenCalledWith(
        "Run renovate-auto-update --help for usage."
      )
      expect(mockedErrorBanner).toHaveBeenCalled()
      expect(process.exitCode).toBe(1)
    })
  })
})
