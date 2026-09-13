import { promises as fs } from "node:fs"
import path from "node:path"

import {
  execFileAsync,
  readPackageJson,
  readRenovateConfig
} from "./file-utils"
import { infoLogger } from "../logging-utils/logger"

jest.mock("node:fs", () => ({
  promises: {
    readFile: jest.fn()
  }
}))

jest.mock("../logging-utils/logger", () => ({
  infoLogger: jest.fn()
}))

describe("file-utils", () => {
  const readFileMock = fs.readFile as jest.MockedFunction<typeof fs.readFile>
  const infoLoggerMock = infoLogger as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("execFileAsync", () => {
    it("exports a promisified function", () => {
      expect(typeof execFileAsync).toBe("function")
    })
  })

  describe("readRenovateConfig", () => {
    it("returns parsed renovate config when file exists and contains an object", async () => {
      const config = {
        packageRules: [
          {
            enabled: false,
            matchPackageNames: ["react"]
          }
        ]
      }

      readFileMock.mockResolvedValueOnce(JSON.stringify(config))

      const result = await readRenovateConfig("/repo")

      expect(result).toEqual(config)

      expect(readFileMock).toHaveBeenCalledWith(
        path.join("/repo", "renovate.json"),
        "utf8"
      )
    })

    it("returns null when renovate.json does not exist", async () => {
      readFileMock.mockRejectedValueOnce(new Error("ENOENT"))

      const result = await readRenovateConfig("/repo")

      expect(result).toBeNull()
    })

    it("throws when renovate.json contains invalid JSON", async () => {
      readFileMock.mockResolvedValueOnce("{invalid-json")

      await expect(readRenovateConfig("/repo")).rejects.toThrow()
    })

    it("throws when renovate.json does not contain an object", async () => {
      readFileMock.mockResolvedValueOnce(
        JSON.stringify(["not", "an", "object"])
      )

      await expect(readRenovateConfig("/repo")).rejects.toThrow()
    })

    it("throws when renovate.json contains a primitive value", async () => {
      readFileMock.mockResolvedValueOnce(JSON.stringify("hello"))

      await expect(readRenovateConfig("/repo")).rejects.toThrow()
    })

    it.each([
      ["minimumReleaseAge", { minimumReleaseAge: true }],
      ["minimumReleaseAgeBehaviour", { minimumReleaseAgeBehaviour: "x" }],
      ["ignoreDeps", { ignoreDeps: ["react", 1] }],
      ["ignoreUnstable", { ignoreUnstable: "yes" }],
      ["respectLatest", { respectLatest: "yes" }],
      ["updatePinnedDependencies", { updatePinnedDependencies: "yes" }],
      ["vulnerabilityAlerts", { vulnerabilityAlerts: "yes" }],
      [
        "vulnerabilityFixStrategy",
        { vulnerabilityAlerts: { vulnerabilityFixStrategy: "middle" } }
      ],
      ["packageRules", { packageRules: {} }]
    ])("rejects invalid %s configuration", async (_name, value) => {
      readFileMock.mockResolvedValueOnce(JSON.stringify(value))

      await expect(readRenovateConfig("/repo")).rejects.toThrow()
    })

    it.each([
      ["enabled", { enabled: "yes" }],
      ["allowedVersions", { allowedVersions: 1 }],
      ["ignoreUnstable", { ignoreUnstable: "yes" }],
      ["respectLatest", { respectLatest: "yes" }],
      ["updatePinnedDependencies", { updatePinnedDependencies: "yes" }],
      ["matchers", { matchPackageNames: ["react", 1] }]
    ])("rejects invalid package rule %s", async (_name, rule) => {
      readFileMock.mockResolvedValueOnce(
        JSON.stringify({ packageRules: [rule] })
      )

      await expect(readRenovateConfig("/repo")).rejects.toThrow()
    })
  })

  describe("readPackageJson", () => {
    it("returns parsed package.json when valid", async () => {
      const packageJson = {
        name: "test-package",
        version: "1.0.0",
        dependencies: {
          react: "^19.0.0"
        }
      }

      readFileMock.mockResolvedValueOnce(JSON.stringify(packageJson))

      const result = await readPackageJson("/repo/package.json")

      expect(result).toEqual(packageJson)

      expect(readFileMock).toHaveBeenCalledWith("/repo/package.json", "utf8")
      expect(infoLoggerMock).toHaveBeenCalledWith(
        "Read package.json from repo/package.json"
      )
    })

    it("throws when package.json contains an array", async () => {
      readFileMock.mockResolvedValueOnce(
        JSON.stringify(["not", "an", "object"])
      )

      await expect(readPackageJson("/repo/package.json")).rejects.toThrow(
        "/repo/package.json must contain a JSON object"
      )
    })

    it("throws when package.json contains a primitive value", async () => {
      readFileMock.mockResolvedValueOnce(JSON.stringify("invalid"))

      await expect(readPackageJson("/repo/package.json")).rejects.toThrow(
        "/repo/package.json must contain a JSON object"
      )
    })

    it("throws when package.json contains invalid JSON", async () => {
      readFileMock.mockResolvedValueOnce("{invalid-json")

      await expect(readPackageJson("/repo/package.json")).rejects.toThrow()
    })

    it("propagates readFile errors", async () => {
      readFileMock.mockRejectedValueOnce(new Error("ENOENT"))

      await expect(readPackageJson("/repo/package.json")).rejects.toThrow(
        "ENOENT"
      )
    })
  })
})
