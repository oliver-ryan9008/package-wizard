import { cancel, intro, isCancel, select, text } from "@clack/prompts"
import {
  promptForApply,
  promptForCommand,
  shellCompletionOptions
} from "./cli-menu"
import { CliCommand } from "./types"
import { aboutHelp, generalHelpBanner } from "./logging-utils/help-options"
import { generalLogger, infoLogger } from "./logging-utils/logger"
import path from "node:path"

jest.mock("@clack/prompts", () => ({
  cancel: jest.fn(),
  intro: jest.fn(),
  isCancel: jest.fn(),
  select: jest.fn(),
  text: jest.fn()
}))

jest.mock("./logging-utils/help-options", () => ({
  aboutHelp: jest.fn(),
  generalHelpBanner: jest.fn()
}))

jest.mock("./logging-utils/logger", () => ({
  generalLogger: jest.fn(),
  infoLogger: jest.fn()
}))

describe("cli-menu", () => {
  const mockedCancel = cancel as jest.MockedFunction<typeof cancel>
  const mockedIntro = intro as jest.MockedFunction<typeof intro>
  const mockedIsCancel = isCancel as jest.MockedFunction<typeof isCancel>
  const mockedSelect = select as jest.MockedFunction<typeof select>
  const mockedText = text as jest.MockedFunction<typeof text>
  const mockedAboutHelp = aboutHelp as jest.MockedFunction<typeof aboutHelp>
  const mockedGeneralHelpBanner = generalHelpBanner as jest.MockedFunction<
    typeof generalHelpBanner
  >
  const mockedGeneralLogger = generalLogger as jest.MockedFunction<
    typeof generalLogger
  >
  const mockedInfoLogger = infoLogger as jest.MockedFunction<typeof infoLogger>

  beforeEach(() => {
    jest.clearAllMocks()
    mockedIsCancel.mockReturnValue(false)
    mockedText.mockResolvedValue("")
  })

  it("starts with preview-first task selection and update scope", async () => {
    mockedSelect
      .mockResolvedValueOnce(CliCommand.Update)
      .mockResolvedValueOnce("minor")

    await expect(promptForCommand()).resolves.toEqual([
      CliCommand.Update,
      "--level",
      "minor",
      "--cwd",
      process.cwd()
    ])

    expect(mockedIntro).toHaveBeenCalledWith("Package Wizard")
    expect(mockedSelect).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        options: expect.arrayContaining([
          expect.objectContaining({
            value: CliCommand.Update,
            label: "Preview dependency updates (Default)",
            hint: "Recommended. No files change."
          })
        ]),
        initialValue: CliCommand.Update
      })
    )
    const rootOptions = mockedSelect.mock.calls[0]?.[0].options
    expect(rootOptions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "back", label: "← Go back" })
      ])
    )
    expect(mockedText).toHaveBeenCalledWith({
      message: "Packages to skip (optional, comma-separated)",
      initialValue: ""
    })
    expect(mockedInfoLogger).toHaveBeenCalled()
    expect(mockedGeneralLogger).toHaveBeenCalledWith(
      "Preview first. Changes will only be applied after review."
    )
  })

  it("reports a missing package.json before showing the menu", async () => {
    const cwdSpy = jest
      .spyOn(process, "cwd")
      .mockReturnValue("/projects/non-node")

    try {
      await expect(promptForCommand()).rejects.toThrow(
        "No package.json found in /projects/non-node. Run this command from a Node.js project or use an explicit command with --cwd <project-directory>."
      )

      expect(mockedIntro).not.toHaveBeenCalled()
      expect(mockedSelect).not.toHaveBeenCalled()
    } finally {
      cwdSpy.mockRestore()
    }
  })

  it("collects audit severity and optional dependency chains", async () => {
    mockedSelect
      .mockResolvedValueOnce(CliCommand.Audit)
      .mockResolvedValueOnce("moderate")
      .mockResolvedValueOnce(true)

    await expect(promptForCommand()).resolves.toEqual([
      CliCommand.Audit,
      "--min-severity",
      "moderate",
      "--show-dep-chain",
      "--cwd",
      process.cwd()
    ])
  })

  it("keeps policy checks read-only and makes audit optional", async () => {
    mockedSelect
      .mockResolvedValueOnce(CliCommand.Check)
      .mockResolvedValueOnce("patch")
      .mockResolvedValueOnce("none")

    await expect(promptForCommand()).resolves.toEqual([
      CliCommand.Check,
      "--level",
      "patch",
      "--cwd",
      process.cwd()
    ])
  })

  it("offers pin-current behavior without unnecessary update scope", async () => {
    mockedSelect
      .mockResolvedValueOnce(CliCommand.Pin)
      .mockResolvedValueOnce("current")

    await expect(promptForCommand()).resolves.toEqual([
      CliCommand.Pin,
      "--no-update",
      "--cwd",
      process.cwd()
    ])
  })

  it("validates and retains a changed target project", async () => {
    mockedSelect
      .mockResolvedValueOnce("target")
      .mockResolvedValueOnce(CliCommand.Update)
      .mockResolvedValueOnce("minor")
    mockedText
      .mockResolvedValueOnce("/projects/example/package.json")
      .mockResolvedValueOnce("")

    await expect(promptForCommand()).resolves.toEqual([
      CliCommand.Update,
      "--level",
      "minor",
      "--cwd",
      path.dirname(path.resolve("/projects/example/package.json"))
    ])

    const textOptions = mockedText.mock.calls[0]?.[0]
    const validate = textOptions?.validate as
      ((value: string | undefined) => string | undefined) | undefined
    expect(validate?.("/does/not/exist")).toContain(
      "Could not find package.json"
    )
    expect(validate?.(process.cwd())).toBeUndefined()
  })

  it("keeps help and about in place without returning operation flags", async () => {
    mockedSelect
      .mockResolvedValueOnce("help")
      .mockResolvedValueOnce(CliCommand.About)
      .mockResolvedValueOnce("exit")

    await expect(promptForCommand()).resolves.toBeNull()

    expect(mockedGeneralHelpBanner).toHaveBeenCalled()
    expect(mockedAboutHelp).toHaveBeenCalled()
  })

  it("cancels cleanly when a prompt is interrupted", async () => {
    mockedSelect.mockResolvedValue(Symbol("cancel") as never)
    mockedIsCancel.mockReturnValue(true)

    await expect(promptForCommand()).resolves.toBeNull()

    expect(mockedCancel).toHaveBeenCalledWith("Operation cancelled.")
  })

  it("defaults to keeping a preview and requires a deliberate apply choice", async () => {
    mockedSelect.mockResolvedValueOnce(false)

    await expect(promptForApply(CliCommand.Update, 2, 1)).resolves.toBe(false)

    expect(mockedSelect).toHaveBeenCalledWith(
      expect.objectContaining({
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
          {
            value: "details",
            label: "Show skipped reasons",
            hint: "View why packages were not changed."
          },
          {
            value: "back",
            label: "← Go back"
          }
        ]
      })
    )
  })

  it("returns to task menu when nested menu goes back", async () => {
    mockedSelect
      .mockResolvedValueOnce(CliCommand.Update)
      .mockResolvedValueOnce("back")
      .mockResolvedValueOnce("exit")

    await expect(promptForCommand()).resolves.toBeNull()

    expect(mockedSelect).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        initialValue: "minor",
        options: expect.arrayContaining([{ value: "back", label: "← Go back" }])
      })
    )
    expect(mockedSelect).toHaveBeenCalledTimes(3)
  })

  it("does not apply when the confirmation prompt is cancelled", async () => {
    mockedSelect.mockResolvedValue(Symbol("cancel") as never)
    mockedIsCancel.mockReturnValue(true)

    await expect(promptForApply(CliCommand.Audit, 1)).resolves.toBeNull()

    expect(mockedCancel).toHaveBeenCalledWith("Changes were not applied.")
  })

  it("publishes supported shell names for completion help", () => {
    expect(shellCompletionOptions).toEqual(["bash", "zsh", "fish"])
  })
})
