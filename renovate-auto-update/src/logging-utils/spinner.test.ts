import { spinner } from "@clack/prompts"
import { startSpinner } from "./spinner"

jest.mock("@clack/prompts", () => ({
  spinner: jest.fn()
}))

describe("startSpinner", () => {
  const mockedSpinner = spinner as jest.MockedFunction<typeof spinner>
  const progress = {
    start: jest.fn(),
    stop: jest.fn(),
    error: jest.fn(),
    message: jest.fn(),
    cancel: jest.fn(),
    clear: jest.fn(),
    isCancelled: false
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockedSpinner.mockReturnValue(progress)
  })

  it("uses a stable Clack dots indicator", () => {
    const instance = startSpinner("Checking dependencies...")

    expect(mockedSpinner).toHaveBeenCalledWith({ indicator: "dots" })
    expect(progress.start).toHaveBeenCalledWith("Checking dependencies...")
    expect(instance.text).toBe("Checking dependencies...")
  })

  it("updates progress and terminal state through one adapter", () => {
    const instance = startSpinner("Checking dependencies...")

    instance.text = "Checking package 2/3: react"
    instance.succeed("Preview complete")
    instance.fail("Package update scan failed")

    expect(progress.message).toHaveBeenCalledWith("Checking package 2/3: react")
    expect(progress.stop).toHaveBeenCalledWith("Preview complete")
    expect(progress.error).toHaveBeenCalledWith("Package update scan failed")
  })
})
