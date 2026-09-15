import { promises as fs } from "node:fs"
import { execFileAsync } from "./file-utils"
import {
  checkPeerDependencies,
  checkProjectPeerDependencies
} from "./peer-utils"

jest.mock("node:fs", () => ({
  promises: {
    mkdtemp: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
    rm: jest.fn()
  }
}))

jest.mock("./file-utils", () => ({
  execFileAsync: jest.fn()
}))

jest.mock("@clack/prompts", () => ({
  progress: jest.fn(() => ({
    start: jest.fn(),
    advance: jest.fn(),
    stop: jest.fn(),
    error: jest.fn()
  }))
}))

describe("peer-utils", () => {
  const mkdtempMock = fs.mkdtemp as jest.MockedFunction<typeof fs.mkdtemp>
  const writeFileMock = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>
  const readFileMock = fs.readFile as jest.MockedFunction<typeof fs.readFile>
  const rmMock = fs.rm as jest.MockedFunction<typeof fs.rm>
  const execFileMock = execFileAsync as jest.MockedFunction<typeof execFileAsync>

  beforeEach(() => {
    jest.clearAllMocks()
    mkdtempMock.mockResolvedValue("/tmp/package-wizard-peers-test")
    writeFileMock.mockResolvedValue(undefined)
    rmMock.mockResolvedValue(undefined)
    execFileMock.mockResolvedValue({ stdout: "{}", stderr: "" } as never)
  })

  it("passes when npm strict peer resolution succeeds", async () => {
    await expect(
      checkPeerDependencies({ dependencies: { react: "^18.0.0" } })
    ).resolves.toEqual({ valid: true })

    expect(execFileMock).toHaveBeenCalledWith(
      "npm",
      expect.arrayContaining(["--strict-peer-deps", "--engine-strict"]),
      expect.objectContaining({ cwd: "/tmp/package-wizard-peers-test" })
    )
    expect(rmMock).toHaveBeenCalled()
  })

  it("reports npm peer resolution failures and cleans up", async () => {
    execFileMock.mockRejectedValueOnce({ stderr: "ERESOLVE unable to resolve" })

    await expect(
      checkPeerDependencies({ dependencies: { react: "^19.0.0" } })
    ).resolves.toEqual({
      valid: false,
      message: "ERESOLVE unable to resolve"
    })
    expect(rmMock).toHaveBeenCalled()
  })

  it("loads project package.json for standalone checks", async () => {
    readFileMock.mockResolvedValueOnce('{"name":"fixture"}' as never)

    await expect(checkProjectPeerDependencies("/repo")).resolves.toEqual({
      valid: true
    })
    expect(readFileMock).toHaveBeenCalledWith("/repo/package.json", "utf8")
  })
})
