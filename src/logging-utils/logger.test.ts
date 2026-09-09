import chalk from "chalk"
import {
  chalkErrorStyle,
  chalkInfoStyle,
  chalkSuccessStyle,
  complexLogger,
  errorBanner,
  errorLogger,
  formatColumns,
  generalLogger,
  infoLogger,
  logObj,
  setColorMode,
  stdErrError,
  stdErrGeneral,
  stdErrInfo,
  stdErrSuccess,
  stdErrWarn,
  successBanner,
  successLogger,
  warnLogger,
  wrapTerminalText
} from "./logger"
import { ColorMode } from "../types"

describe("logger", () => {
  let stdoutSpy: jest.SpyInstance
  let stderrSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    stdoutSpy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true)
    stderrSpy = jest
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
    stderrSpy.mockRestore()
  })

  it("writes success content to stdout and errors to stderr", () => {
    successBanner("Preview complete")
    successLogger("Changes ready")
    infoLogger("Target: /repo/package.json")
    generalLogger("Plain detail")
    errorBanner("Operation failed")
    errorLogger("Something failed")
    warnLogger("Review needed")

    expect(stdoutSpy).toHaveBeenCalledWith(
      "[BOLD.GREENBRIGHT]\n[OK] Preview complete\n"
    )
    expect(stdoutSpy).toHaveBeenCalledWith("[BOLD.GREENBRIGHT]Changes ready\n")
    expect(stdoutSpy).toHaveBeenCalledWith(
      "[BOLD.CYAN]Target: /repo/package.json\n"
    )
    expect(stdoutSpy).toHaveBeenCalledWith("[RESET]Plain detail\n")
    expect(stderrSpy).toHaveBeenCalledWith(
      "[BOLD.REDBRIGHT]\n[ERROR] Operation failed\n"
    )
    expect(stderrSpy).toHaveBeenCalledWith("[BOLD.REDBRIGHT]Something failed\n")
    expect(stderrSpy).toHaveBeenCalledWith("[BOLD.YELLOWBRIGHT]Review needed\n")
  })

  it("keeps JSON output compact and free of presentation formatting", () => {
    const result = { updated: ["react"], skipped: [] }

    logObj(result)

    expect(stdoutSpy).toHaveBeenCalledWith(`${JSON.stringify(result)}\n`)
    expect(stderrSpy).not.toHaveBeenCalled()
  })

  it("retains explicit stderr helpers for lower-level diagnostics", () => {
    stdErrSuccess("success")
    stdErrError("error")
    stdErrInfo("info")
    stdErrWarn("warn")
    stdErrGeneral("general")

    expect(stderrSpy).toHaveBeenCalledWith("[BOLD.GREENBRIGHT]success")
    expect(stderrSpy).toHaveBeenCalledWith("[BOLD.REDBRIGHT]error")
    expect(stderrSpy).toHaveBeenCalledWith("[BOLD.CYAN]info")
    expect(stderrSpy).toHaveBeenCalledWith("[BOLD.YELLOWBRIGHT]warn")
    expect(stderrSpy).toHaveBeenCalledWith("[RESET]general")
  })

  it("keeps complex logger styling available for structured detail", () => {
    complexLogger({
      prefix: "PREFIX",
      message: "MESSAGE",
      suffix: "SUFFIX",
      prefixColor: chalkErrorStyle,
      messageColor: chalkSuccessStyle,
      suffixColor: chalkInfoStyle
    })

    expect(stdoutSpy).toHaveBeenCalledWith(
      `${chalkErrorStyle("PREFIX")} ${chalkSuccessStyle(
        "MESSAGE"
      )} ${chalkInfoStyle("SUFFIX")}\n`
    )
  })

  it("wraps terminal text while preserving indentation", () => {
    const stream = { isTTY: true, columns: 24 } as NodeJS.WriteStream

    expect(wrapTerminalText("  Updates are ready for review", stream)).toBe(
      "  Updates are ready for\n  review"
    )
  })

  it("formats responsive columns with aligned continuation lines", () => {
    const stream = { isTTY: true, columns: 64 } as NodeJS.WriteStream
    const rendered = formatColumns(
      [
        {
          label: "--min-severity <level>",
          description:
            "Minimum vulnerability severity for audit and maintenance checks."
        }
      ],
      { stream }
    )

    const lines = rendered.split("\n")
    expect(lines[0]).toContain("--min-severity <level>")
    expect(lines.slice(1).every(line => line.startsWith(" ".repeat(26)))).toBe(
      true
    )
  })

  it("stacks columns instead of breaking labels on narrow terminals", () => {
    const stream = { isTTY: true, columns: 40 } as NodeJS.WriteStream
    const rendered = formatColumns(
      [
        {
          label: "--color <auto|always|never>",
          description: "Control terminal color output."
        }
      ],
      { stream }
    )

    expect(rendered).toBe(
      "  --color <auto|always|never>\n    Control terminal color output."
    )
  })

  it("supports explicit color modes", () => {
    setColorMode(ColorMode.Never)
    expect(chalk.level).toBe(0)

    setColorMode(ColorMode.Always)
    expect(chalk.level).toBe(3)
  })
})
