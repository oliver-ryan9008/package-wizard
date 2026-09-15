import { promises as fs } from "node:fs"
import path from "node:path"

import {
  execFileAsync,
  readPackageJson,
  readDependencyConfig
} from "./file-utils"
import { infoLogger } from "../logging-utils/logger"

jest.mock("node:fs", () => ({
  promises: {
    readFile: jest.fn()
  }
}))

jest.mock("../logging-utils/logger", () => ({
  generalLogger: jest.fn(),
  infoLogger: jest.fn()
}))

describe("file-utils", () => {
  const readFileMock = fs.readFile as jest.MockedFunction<typeof fs.readFile>
  const infoLoggerMock = infoLogger as jest.Mock

  beforeEach(() => {
    jest.resetAllMocks()
  })

  describe("execFileAsync", () => {
    it("exports a promisified function", () => {
      expect(typeof execFileAsync).toBe("function")
    })
  })

  describe("readRenovateConfig", () => {
    const missingFileError = () =>
      Object.assign(new Error("missing"), { code: "ENOENT" })
    const mockPackageWizardFilesAbsent = () => {
      readFileMock
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
    }

    it("returns parsed renovate config when file exists and contains an object", async () => {
      const config = {
        packageRules: [
          {
            enabled: false,
            matchPackageNames: ["react"]
          }
        ]
      }

      mockPackageWizardFilesAbsent()
      readFileMock.mockResolvedValueOnce(JSON.stringify(config))

      const result = await readDependencyConfig("/repo")

      expect(result).toEqual(config)

      expect(readFileMock).toHaveBeenCalledWith(
        path.join("/repo", "renovate.json"),
        "utf8"
      )
      expect(infoLoggerMock).toHaveBeenCalledWith(
        "Read dependency configuration from repo/renovate.json"
      )
    })

    it("uses package.wizard.json as source of truth when both configs exist", async () => {
      readFileMock
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockResolvedValueOnce(JSON.stringify({ ignore: ["react"] }))
        .mockResolvedValueOnce(
          JSON.stringify({ packageRules: [{ enabled: false }] })
        )

      await expect(readDependencyConfig("/repo")).resolves.toEqual({
        ignoreDeps: ["react"],
        packageRules: []
      })

      expect(readFileMock).toHaveBeenCalledTimes(4)
      expect(readFileMock).toHaveBeenCalledWith(
        path.join("/repo", "package.wizard.json"),
        "utf8"
      )
      expect(infoLoggerMock).toHaveBeenCalledWith(
        "Read dependency configuration from repo/package.wizard.json"
      )
    })

    it("returns null when renovate.json does not exist", async () => {
      readFileMock
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())

      const result = await readDependencyConfig("/repo")

      expect(result).toBeNull()
    })

    it("reads package.wizard.json when renovate.json is absent", async () => {
      readFileMock
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockResolvedValueOnce(
          JSON.stringify({
            ignore: ["left-pad"],
            defaults: {
              minimumReleaseAge: "3 days",
              respectLatest: false
            },
            packages: {
              "@types/*": { enabled: false }
            },
            rules: [{ packageName: "react", allowedVersions: "^18" }]
          })
        )

      await expect(readDependencyConfig("/repo")).resolves.toEqual({
        ignoreDeps: ["left-pad"],
        minimumReleaseAge: "3 days",
        respectLatest: false,
        packageRules: [
          {
            matchPackagePatterns: ["^@types/.*$"],
            enabled: false
          },
          {
            matchPackageNames: ["react"],
            allowedVersions: "^18"
          }
        ]
      })
    })

    it("supports deprecated package selector in native rules", async () => {
      readFileMock
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockResolvedValueOnce(
          JSON.stringify({ rules: [{ package: "react", allowedVersions: "^18" }] })
        )

      await expect(readDependencyConfig("/repo")).resolves.toEqual({
        packageRules: [
          {
            matchPackageNames: ["react"],
            allowedVersions: "^18"
          }
        ]
      })
    })

    it("reads audit and mandatory-update defaults from native config", async () => {
      readFileMock
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockResolvedValueOnce(
          JSON.stringify({
            audit: {
              minSeverity: "moderate",
              showDepChain: true,
              vulnerabilityFixStrategy: "highest"
            },
            mandatoryUpdates: {
              level: "major",
              minSeverity: "high"
            }
          })
        )

      await expect(readDependencyConfig("/repo")).resolves.toEqual({
        packageRules: [],
        audit: {
          minSeverity: "moderate",
          showDepChain: true,
          vulnerabilityFixStrategy: "highest"
        },
        mandatoryUpdates: {
          level: "major",
          minSeverity: "high"
        }
      })
    })

    it("reads npm-check-updates exclusions when other configs are absent", async () => {
      readFileMock
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockResolvedValueOnce(JSON.stringify({ reject: ["left-pad"] }))

      await expect(readDependencyConfig("/repo")).resolves.toEqual({
        ignoreDeps: ["left-pad"],
        minimumReleaseAge: "3 days"
      })
      expect(infoLoggerMock).toHaveBeenCalledWith(
        "Read dependency configuration from repo/.ncurc.json"
      )
    })

    it("maps npm-check-updates reject patterns and cooldown", async () => {
      readFileMock
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockResolvedValueOnce(
          JSON.stringify({ reject: ["react", "@types/*", "/^eslint/"] , cooldown: "7d" })
        )

      await expect(readDependencyConfig("/repo")).resolves.toEqual({
        ignoreDeps: ["react"],
        packageRules: [
          { matchPackagePatterns: ["^@types/.*$"], enabled: false },
          { matchPackagePatterns: ["^eslint"], enabled: false }
        ],
        minimumReleaseAge: "7d"
      })
    })

    it("reads Dependabot ignore rules when JSON configs are absent", async () => {
      readFileMock
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockResolvedValueOnce(
          `version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n    ignore:\n      - dependency-name: react\n        update-types: [version-update:semver-major]`
        )

      await expect(readDependencyConfig("/repo")).resolves.toEqual({
        packageRules: [
          {
            matchPackageNames: ["react"],
            matchUpdateTypes: ["major"],
            enabled: false
          }
        ],
        minimumReleaseAge: "3 days"
      })
      expect(infoLoggerMock).toHaveBeenCalledWith(
        "Read dependency configuration from .github/dependabot.yml"
      )
    })

    it("maps Dependabot update-type-only ignore rules", async () => {
      readFileMock
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockResolvedValueOnce(
          `version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n    ignore:\n      - update-types: [version-update:semver-major]`
        )

      await expect(readDependencyConfig("/repo")).resolves.toEqual({
        packageRules: [
          {
            matchUpdateTypes: ["major"],
            enabled: false
          }
        ],
        minimumReleaseAge: "3 days"
      })
    })

    it("normalizes Renovate's release-age spelling", async () => {
      mockPackageWizardFilesAbsent()
      readFileMock.mockResolvedValueOnce(
        JSON.stringify({ minimumReleaseAgeBehaviour: "timestamp-required" })
      )

      await expect(readDependencyConfig("/repo")).resolves.toEqual({
        minimumReleaseAgeBehaviour: "timestamp-required",
        minimumReleaseAgeBehavior: "timestamp-required"
      })
    })

    it("rejects invalid package.wizard.json values", async () => {
      readFileMock
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockResolvedValueOnce(JSON.stringify({ ignore: ["react", 1] }))

      await expect(readDependencyConfig("/repo")).rejects.toThrow(
        "package.wizard.json ignore must be a string array"
      )
    })

    it("rejects native Renovate-style update matching", async () => {
      readFileMock
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
      readFileMock.mockResolvedValueOnce(
        JSON.stringify({
          packages: { react: { matchUpdateTypes: ["minor"] } }
        })
      )

      await expect(readDependencyConfig("/repo")).rejects.toThrow(
        "Use enabledUpdateTypes or disabledUpdateTypes instead"
      )
    })

    it("rejects package-scoped allowedVersions in global defaults", async () => {
      readFileMock
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockResolvedValueOnce(
          JSON.stringify({ defaults: { allowedVersions: "^18" } })
        )

      await expect(readDependencyConfig("/repo")).rejects.toThrow(
        "defaults.allowedVersions is package-specific"
      )
    })

    it("rejects overlapping enabled and disabled update types", async () => {
      readFileMock
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
      readFileMock.mockResolvedValueOnce(
        JSON.stringify({
          packages: {
            react: {
              enabledUpdateTypes: ["minor", "patch"],
              disabledUpdateTypes: "minor"
            }
          }
        })
      )

      await expect(readDependencyConfig("/repo")).rejects.toThrow(
        "enables and disables minor updates"
      )
    })

    it("expands all enabled update types for defaults, rules, and packages", async () => {
      readFileMock
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockResolvedValueOnce(
          JSON.stringify({
            defaults: { enabledUpdateTypes: ["patch"] },
            rules: [{ packageName: "@types/node", enabledUpdateTypes: ["all"] }],
            packages: {
              "@types/jest": { enabledUpdateTypes: ["all"] }
            }
          })
        )

      await expect(readDependencyConfig("/repo")).resolves.toEqual({
        packageRules: [
          { enabled: true, matchUpdateTypes: ["patch"] },
          {
            matchPackageNames: ["@types/jest"],
            enabled: true,
            matchUpdateTypes: ["patch", "minor", "major"]
          },
          {
            matchPackageNames: ["@types/node"],
            enabled: true,
            matchUpdateTypes: ["patch", "minor", "major"]
          }
        ]
      })
    })

    it("rejects conflicting rules for the same package", async () => {
      readFileMock
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
        .mockRejectedValueOnce(missingFileError())
      readFileMock.mockResolvedValueOnce(
        JSON.stringify({
          rules: [
            { packageName: "react", enabled: false },
            { packageName: "react", enabled: true }
          ]
        })
      )

      await expect(readDependencyConfig("/repo")).rejects.toThrow(
        "conflicting enabled values for react"
      )
    })

    it("throws when renovate.json contains invalid JSON", async () => {
      mockPackageWizardFilesAbsent()
      readFileMock.mockResolvedValueOnce("{invalid-json")

      await expect(readDependencyConfig("/repo")).rejects.toThrow()
    })

    it("throws when renovate.json does not contain an object", async () => {
      mockPackageWizardFilesAbsent()
      readFileMock.mockResolvedValueOnce(JSON.stringify(["not", "an", "object"]))

      await expect(readDependencyConfig("/repo")).rejects.toThrow()
    })

    it("throws when renovate.json contains a primitive value", async () => {
      mockPackageWizardFilesAbsent()
      readFileMock.mockResolvedValueOnce(JSON.stringify("hello"))

      await expect(readDependencyConfig("/repo")).rejects.toThrow()
    })

    it.each([
      ["minimumReleaseAge", { minimumReleaseAge: true }],
      ["minimumReleaseAgeBehavior", { minimumReleaseAgeBehavior: "x" }],
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
      mockPackageWizardFilesAbsent()
      readFileMock.mockResolvedValueOnce(JSON.stringify(value))

      await expect(readDependencyConfig("/repo")).rejects.toThrow()
    })

    it.each([
      ["enabled", { enabled: "yes" }],
      ["allowedVersions", { allowedVersions: 1 }],
      ["ignoreUnstable", { ignoreUnstable: "yes" }],
      ["respectLatest", { respectLatest: "yes" }],
      ["updatePinnedDependencies", { updatePinnedDependencies: "yes" }],
      ["matchers", { matchPackageNames: ["react", 1] }]
    ])("rejects invalid package rule %s", async (_name, rule) => {
      mockPackageWizardFilesAbsent()
      readFileMock.mockResolvedValueOnce(JSON.stringify({ packageRules: [rule] }))

      await expect(readDependencyConfig("/repo")).rejects.toThrow()
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
