import { existsSync, readFileSync } from "node:fs"
import {
  getInstallCommand,
  printAuditResult,
  printShellCompletion,
  printUpdateResult
} from "./cli-ui"
import {
  CliCommand,
  CliOptions,
  UpdateResult,
  VulnerabilityFixResult
} from "./types"
import {
  formatColumns,
  generalLogger,
  infoLogger,
  successBanner,
  successLogger
} from "./logging-utils/logger"

jest.mock("@clack/prompts", () => ({
  spinner: jest.fn()
}))

jest.mock("node:fs", () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn()
}))

jest.mock("./logging-utils/logger", () => ({
  errorBanner: jest.fn(),
  errorLogger: jest.fn(),
  formatColumns: jest.fn().mockReturnValue("formatted rows"),
  generalLogger: jest.fn(),
  infoLogger: jest.fn(),
  successBanner: jest.fn(),
  successLogger: jest.fn(),
  warnLogger: jest.fn()
}))

const mockedExistsSync = existsSync as jest.MockedFunction<typeof existsSync>
const mockedReadFileSync = readFileSync as jest.MockedFunction<
  typeof readFileSync
>
const mockedFormatColumns = formatColumns as jest.MockedFunction<
  typeof formatColumns
>
const mockedGeneralLogger = generalLogger as jest.MockedFunction<
  typeof generalLogger
>
const mockedInfoLogger = infoLogger as jest.MockedFunction<typeof infoLogger>
const mockedSuccessBanner = successBanner as jest.MockedFunction<
  typeof successBanner
>
const mockedSuccessLogger = successLogger as jest.MockedFunction<
  typeof successLogger
>

const previewOptions: CliOptions = {
  command: CliCommand.Update,
  level: "minor",
  dryRun: true,
  apply: false,
  json: false,
  audit: false,
  pin: false,
  noUpdate: false,
  skip: [],
  fix: false,
  showDepChain: false,
  verbose: false
}

const result: UpdateResult = {
  packageJsonPath: "/repo/package.json",
  updated: [
    {
      section: "dependencies",
      name: "react",
      from: "^18.0.0",
      to: "^18.1.0"
    },
    {
      section: "devDependencies",
      name: "typescript",
      from: "^5.0.0",
      to: "^5.1.0"
    }
  ],
  skipped: [
    {
      section: "dependencies",
      name: "legacy-package",
      reason: "Skipped via --skip"
    }
  ],
  configExcluded: []
}

describe("cli-ui", () => {
  let stdoutSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    mockedReadFileSync.mockReturnValue("{}")
    mockedExistsSync.mockReturnValue(false)
    mockedFormatColumns.mockReturnValue("formatted rows")
    stdoutSpy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
  })

  it("prefers packageManager metadata and falls back to lockfiles", () => {
    mockedReadFileSync.mockReturnValue('{"packageManager":"pnpm@10.0.0"}')

    expect(getInstallCommand("/repo")).toBe("pnpm install")

    mockedReadFileSync.mockImplementation(() => {
      throw new Error("unreadable")
    })
    mockedExistsSync.mockImplementation(value =>
      String(value).endsWith("yarn.lock")
    )

    expect(getInstallCommand("/repo")).toBe("yarn install")
  })

  it("renders grouped preview changes and compact skipped summary", () => {
    expect(printUpdateResult(result, previewOptions)).toBe(2)

    expect(mockedInfoLogger).toHaveBeenCalledWith("Scan complete")
    expect(mockedGeneralLogger).toHaveBeenCalledWith("  Changes: 2 changes")
    expect(mockedGeneralLogger).toHaveBeenCalledWith("  Skipped: 1 package")
    expect(mockedInfoLogger).toHaveBeenCalledWith("Production dependencies (1)")
    expect(mockedInfoLogger).toHaveBeenCalledWith(
      "Development dependencies (1)"
    )
    expect(mockedInfoLogger).toHaveBeenCalledWith("1 package skipped.")
    expect(mockedSuccessBanner).toHaveBeenCalledWith(
      "Preview complete. package.json was not modified."
    )
  })

  it("renders detailed skips only in verbose mode", () => {
    printUpdateResult(result, { ...previewOptions, verbose: true })

    expect(mockedInfoLogger).toHaveBeenCalledWith("Skipped packages (1)")
    expect(mockedGeneralLogger).toHaveBeenCalledWith("formatted rows")
  })

  it("renders audit vulnerabilities as spaced detail records", () => {
    const auditResult: VulnerabilityFixResult = {
      packageJsonPath: "/repo/package.json",
      vulnerabilities: [
        {
          name: "brace-expansion",
          severity: "high",
          isDirect: false,
          range: "<=1.1.17",
          titles: ["Denial of service"],
          fixAvailable: false,
          dependencyChain: "root\nbrace-expansion"
        },
        {
          name: "browserslist",
          severity: "moderate",
          isDirect: true,
          range: "<=4.28.6",
          titles: [],
          fixAvailable: { version: "4.29.0", isSemVerMajor: false }
        }
      ],
      fixed: [],
      skipped: []
    }

    printAuditResult(auditResult, { ...previewOptions, command: CliCommand.Audit })

    const output = mockedGeneralLogger.mock.calls
      .map(([message]) => message)
      .find(message => message.includes("brace-expansion"))
    expect(output).toContain("  Issue: Denial of service")
    expect(output).toContain("  Vulnerable range: <=1.1.17")
    expect(output).toContain("  Fix: unavailable")
    expect(output).toContain("  Dependency chain: root -> brace-expansion")
    expect(output).toContain("\n\n")
    expect(output).toContain("browserslist")
  })

  it("prints shell completion scripts without visual logger output", () => {
    printShellCompletion("zsh")

    expect(stdoutSpy).toHaveBeenCalledWith(
      expect.stringContaining("#compdef package-wizard")
    )
    expect(mockedSuccessLogger).not.toHaveBeenCalled()
    expect(() => printShellCompletion("powershell")).toThrow(
      "completion shell must be one of: bash, zsh, fish"
    )
  })
})
