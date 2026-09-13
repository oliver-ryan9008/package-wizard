import { aboutHelp, checkForHelpOptions, printHelp } from "./help-options"
import { CliCommand, CliOptions } from "../types"
import {
  formatColumns,
  generalLogger,
  infoLogger,
  successLogger
} from "./logger"

jest.mock("./logger", () => ({
  formatColumns: jest.fn().mockReturnValue("formatted options"),
  generalLogger: jest.fn(),
  infoLogger: jest.fn(),
  successLogger: jest.fn()
}))

const mockedFormatColumns = formatColumns as jest.MockedFunction<
  typeof formatColumns
>
const mockedGeneralLogger = generalLogger as jest.MockedFunction<
  typeof generalLogger
>
const mockedInfoLogger = infoLogger as jest.MockedFunction<typeof infoLogger>
const mockedSuccessLogger = successLogger as jest.MockedFunction<
  typeof successLogger
>

const baseOptions: CliOptions = {
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
  verbose: false,
  help: false
}

describe("help-options", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedFormatColumns.mockReturnValue("formatted options")
  })

  it("renders short generated general help", () => {
    printHelp()

    expect(mockedSuccessLogger).toHaveBeenCalledWith("Package Wizard")
    expect(mockedInfoLogger).toHaveBeenCalledWith(
      "Usage: package-wizard <command> [options]"
    )
    expect(mockedFormatColumns).toHaveBeenCalledTimes(2)
    expect(mockedGeneralLogger).toHaveBeenCalledWith(
      "  Legacy --audit, --pin, and --mandatory-update-check flags remain supported."
    )
  })

  it("limits command help to command-relevant options", () => {
    printHelp(CliCommand.Audit)

    expect(mockedInfoLogger).toHaveBeenCalledWith(
      "Usage: package-wizard audit [options]"
    )
    expect(mockedFormatColumns).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ label: "--min-severity <level>" }),
        expect.objectContaining({ label: "--show-dep-chain" }),
        expect.objectContaining({ label: "-y, --apply" })
      ])
    )
    expect(mockedGeneralLogger).toHaveBeenCalledWith(
      "  Preview is default. Use --apply only after review."
    )
  })

  it("renders about text without static contact details", () => {
    aboutHelp()

    expect(mockedGeneralLogger).toHaveBeenCalledWith(
      "  Preview dependency updates, audit fixes, and maintenance policy checks."
    )
    expect(mockedInfoLogger).toHaveBeenCalledWith(
      "Use package-wizard --help for commands and examples."
    )
  })

  it("reports whether help handled the current command", () => {
    expect(checkForHelpOptions(baseOptions)).toBe(false)
    expect(mockedSuccessLogger).not.toHaveBeenCalled()

    expect(checkForHelpOptions({ ...baseOptions, help: true })).toBe(true)
    expect(mockedSuccessLogger).toHaveBeenCalledWith("Package Wizard")
  })
})
