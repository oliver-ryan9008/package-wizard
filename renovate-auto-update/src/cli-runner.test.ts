describe("cli-runner", () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalExitCode = process.exitCode

  beforeEach(() => {
    jest.resetModules()
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    process.exitCode = originalExitCode
    jest.restoreAllMocks()
  })

  it("calls run when NODE_ENV is not test", async () => {
    process.env.NODE_ENV = "production"

    const runMock = jest.fn()

    jest.doMock("./cli", () => ({
      run: runMock
    }))

    await import("./cli-runner")

    expect(runMock).toHaveBeenCalledTimes(1)
  })

  it("does not call run when NODE_ENV is test", async () => {
    process.env.NODE_ENV = "test"

    const runMock = jest.fn()

    jest.doMock("./cli", () => ({
      run: runMock
    }))

    await import("./cli-runner")

    expect(runMock).not.toHaveBeenCalled()
  })

  it("sets a failing exit code for mandatory updates", async () => {
    process.env.NODE_ENV = "production"

    const runMock = jest.fn().mockResolvedValue({ hasMandatoryUpdates: true })

    jest.doMock("./cli", () => ({
      run: runMock
    }))

    await import("./cli-runner")
    await Promise.resolve()

    expect(process.exitCode).toBe(2)
  })

  it("sets exit code one when run returns an Error", async () => {
    process.env.NODE_ENV = "production"
    const runMock = jest.fn().mockResolvedValue(new Error("returned failure"))

    jest.doMock("./cli", () => ({
      run: runMock
    }))

    await import("./cli-runner")
    await Promise.resolve()

    expect(process.exitCode).toBe(1)
  })

  it("serializes rejected runs as CLI errors", async () => {
    process.env.NODE_ENV = "production"
    const writeMock = jest
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true)
    const runMock = jest.fn().mockRejectedValue("failure")

    jest.doMock("./cli", () => ({
      run: runMock
    }))

    await import("./cli-runner")
    await Promise.resolve()
    await Promise.resolve()

    expect(writeMock).toHaveBeenCalledWith(
      '{"error":"failure","code":"CLI_ERROR"}\n'
    )
    expect(process.exitCode).toBe(1)
  })
})
