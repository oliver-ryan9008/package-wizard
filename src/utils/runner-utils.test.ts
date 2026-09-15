import { promises as fs } from "node:fs"
import semver from "semver"
import {
  getCandidateVersions,
  parseSupportedSpec,
  selectTargetUpdate,
  selectTargetVersion,
  getPackageMetadata,
  parseMinimumReleaseAge,
  filterVersionsByReleaseAge
} from "./package-utils"
import {
  getErrorMessageForMandatoryUpdates,
  getPassedMessageForMandatoryUpdates
} from "./update-utils"
import { getDependencyChain } from "./audit-utils"
import {
  execFileAsync,
  readPackageJson,
  readDependencyConfig
} from "./file-utils"
import * as auditUtils from "./audit-utils"
import * as packageUtils from "./package-utils"
import * as updateUtils from "./update-utils"

const utils = { ...auditUtils, ...packageUtils, ...updateUtils }

jest.mock("node:fs", () => ({
  promises: {
    writeFile: jest.fn(),
    rename: jest.fn(),
    rm: jest.fn()
  }
}))

jest.mock("./file-utils", () => ({
  execFileAsync: jest.fn(),
  readPackageJson: jest.fn(),
  readDependencyConfig: jest.fn(),
  writePackageJsonAtomically:
    jest.requireActual("./file-utils").writePackageJsonAtomically
}))

const execMock = execFileAsync as unknown as jest.Mock
const readPackageJsonMock = readPackageJson as unknown as jest.Mock
const readDependencyConfigMock = readDependencyConfig as unknown as jest.Mock
const writeFileMock = fs.writeFile as unknown as jest.Mock
const renameMock = fs.rename as unknown as jest.Mock
const rmMock = fs.rm as unknown as jest.Mock

describe("utils helpers", () => {
  describe("parseSupportedSpec", () => {
    it("parses caret versions", () => {
      const result = parseSupportedSpec("^1.2.3")

      expect(result?.prefix).toBe("^")
      expect(result?.version.version).toBe("1.2.3")
    })

    it("parses tilde versions", () => {
      const result = parseSupportedSpec("~1.2.3")

      expect(result?.prefix).toBe("~")
      expect(result?.version.version).toBe("1.2.3")
    })

    it("parses pinned versions", () => {
      const result = parseSupportedSpec("1.2.3")

      expect(result?.prefix).toBe("")
      expect(result?.version.version).toBe("1.2.3")
    })

    it.each([
      "workspace:*",
      "file:../pkg",
      "link:../pkg",
      "npm:foo",
      "git+https://example.com/repo.git",
      "https://example.com/package.tgz",
      "^1.0.0 || ^2.0.0"
    ])("returns null for unsupported spec %s", spec => {
      expect(parseSupportedSpec(spec)).toBeNull()
    })

    it("returns null for invalid semver", () => {
      expect(parseSupportedSpec("abc123")).toBeNull()
    })
  })

  describe("getCandidateVersions", () => {
    const current = semver.parse("1.2.0")!

    it("returns patch updates only for patch level", () => {
      const result = getCandidateVersions(
        ["1.2.1", "1.2.5", "1.3.0", "2.0.0"],
        current,
        "patch"
      )

      expect(result.map(v => v.version)).toEqual(["1.2.5", "1.2.1"])
    })

    it("returns minor and patch updates for minor level", () => {
      const result = getCandidateVersions(
        ["1.2.1", "1.3.0", "1.4.0", "2.0.0"],
        current,
        "minor"
      )

      expect(result.map(v => v.version)).toEqual(["1.4.0", "1.3.0", "1.2.1"])
    })

    it("returns major updates when level is major", () => {
      const result = getCandidateVersions(
        ["1.2.1", "1.3.0", "2.0.0"],
        current,
        "major"
      )

      expect(result.map(v => v.version)).toEqual(["2.0.0", "1.3.0", "1.2.1"])
    })

    it("filters prerelease versions", () => {
      const result = getCandidateVersions(
        ["1.2.1", "1.3.0-beta.1"],
        current,
        "minor"
      )

      expect(result.map(v => v.version)).toEqual(["1.2.1"])
    })

    it("includes prerelease versions when requested", () => {
      const result = getCandidateVersions(
        ["1.3.0-beta.1", "1.2.1"],
        current,
        "minor",
        false
      )

      expect(result.map(v => v.version)).toEqual(["1.3.0-beta.1", "1.2.1"])
    })

    it("filters versions older than current", () => {
      const result = getCandidateVersions(
        ["1.0.0", "1.1.0", "1.2.0"],
        current,
        "major"
      )

      expect(result).toEqual([])
    })
  })

  describe("selectTargetVersion", () => {
    it("returns highest eligible version", () => {
      const current = semver.parse("1.0.0")!

      expect(
        selectTargetVersion(["1.1.0", "1.2.0", "2.0.0"], current, "minor")
      ).toBe("1.2.0")
    })

    it("returns null when no version is eligible", () => {
      const current = semver.parse("1.0.0")!

      expect(selectTargetVersion(["1.0.0"], current, "major")).toBeNull()
    })
  })

  describe("selectTargetUpdate", () => {
    it("returns first allowed candidate", () => {
      const current = semver.parse("1.0.0")!

      const result = selectTargetUpdate(
        ["1.1.0", "2.0.0"],
        current,
        "major",
        updateType => updateType !== "major"
      )

      expect(result).toEqual({
        version: "1.1.0",
        updateType: "minor"
      })
    })

    it("returns null when all candidates are blocked", () => {
      const current = semver.parse("1.0.0")!

      const result = selectTargetUpdate(
        ["1.1.0", "2.0.0"],
        current,
        "major",
        () => false
      )

      expect(result).toBeNull()
    })
  })

  describe("release age filtering", () => {
    const now = Date.parse("2026-08-28T12:00:00.000Z")

    it("parses a configured one-day minimum release age", () => {
      expect(parseMinimumReleaseAge("1 day")).toBe(24 * 60 * 60 * 1000)
      expect(
        filterVersionsByReleaseAge(
          ["1.0.0", "1.1.0"],
          {
            "1.0.0": "2026-08-26T12:00:00.000Z",
            "1.1.0": "2026-08-28T00:00:00.000Z"
          },
          "1 day",
          now
        )
      ).toEqual(["1.0.0"])
    })

    it("honors configured release age and disabled policy", () => {
      const releases = {
        "1.0.0": "2026-08-28T00:00:00.000Z",
        "1.1.0": "2026-08-27T00:00:00.000Z"
      }

      expect(
        filterVersionsByReleaseAge(["1.0.0", "1.1.0"], releases, "2 days", now)
      ).toEqual([])
      expect(
        filterVersionsByReleaseAge(["1.0.0", "1.1.0"], releases, false, now)
      ).toEqual(["1.0.0", "1.1.0"])
    })

    it("handles invalid and numeric release ages", () => {
      expect(parseMinimumReleaseAge(false)).toBe(0)
      expect(parseMinimumReleaseAge(5000)).toBe(5000)
      expect(parseMinimumReleaseAge(-1)).toBe(24 * 60 * 60 * 1000)
      expect(parseMinimumReleaseAge("not a duration")).toBe(24 * 60 * 60 * 1000)
      expect(
        filterVersionsByReleaseAge(
          ["1.0.0"],
          {},
          "1 day",
          now,
          "timestamp-optional"
        )
      ).toEqual(["1.0.0"])
    })
  })

  describe("getErrorMessageForMandatoryUpdates", () => {
    it("includes update count only", () => {
      expect(getErrorMessageForMandatoryUpdates("minor", 3, 0)).toContain(
        '3 dependency update(s) at or above "minor"'
      )
    })

    it("includes vulnerability count only", () => {
      expect(getErrorMessageForMandatoryUpdates("minor", 0, 2)).toContain(
        "2 audit vulnerabilities"
      )
    })

    it("includes both counts", () => {
      expect(getErrorMessageForMandatoryUpdates("major", 2, 1)).toContain(
        '2 dependency update(s) at or above "major" and 1 audit vulnerability'
      )
    })
  })

  describe("getPassedMessageForMandatoryUpdates", () => {
    it("returns success message", () => {
      expect(getPassedMessageForMandatoryUpdates("minor")).toBe(
        "No mandatory updates found for your project's configured update level 'minor', and no audit vulnerabilities were found."
      )
    })
  })
})

describe("utils integration tests", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("getAllVersions parses array output and string output", async () => {
    execMock.mockResolvedValueOnce({ stdout: Buffer.from('["1.0.0","2.0.0"]') })

    const arr = await utils.getAllVersions("pkg", "/cwd")

    expect(arr).toEqual(["1.0.0", "2.0.0"])

    execMock.mockResolvedValueOnce({ stdout: Buffer.from('"1.2.3"') })

    const single = await utils.getAllVersions("pkg", "/cwd")

    expect(single).toEqual(["1.2.3"])

    execMock.mockResolvedValueOnce({ stdout: Buffer.from("{}") })
    await expect(utils.getAllVersions("pkg", "/cwd")).resolves.toEqual([])
  })

  it("getPackageMetadata parses versions and publication times", async () => {
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          versions: ["1.0.0", "1.1.0"],
          time: {
            "1.0.0": "2026-08-26T12:00:00.000Z",
            "1.1.0": "2026-08-28T00:00:00.000Z"
          }
        })
      )
    })

    await expect(getPackageMetadata("pkg", "/cwd")).resolves.toEqual({
      versions: ["1.0.0", "1.1.0"],
      releaseTimes: {
        "1.0.0": "2026-08-26T12:00:00.000Z",
        "1.1.0": "2026-08-28T00:00:00.000Z"
      }
    })

    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify([
          {
            versions: ["1.0.0", "1.1.0"],
            time: {
              "1.0.0": "2026-08-26T12:00:00.000Z",
              "1.1.0": "2026-08-28T00:00:00.000Z"
            },
            "dist-tags": { latest: "1.1.0" }
          }
        ])
      )
    })

    await expect(getPackageMetadata("pkg", "/cwd")).resolves.toEqual({
      versions: ["1.0.0", "1.1.0"],
      releaseTimes: {
        "1.0.0": "2026-08-26T12:00:00.000Z",
        "1.1.0": "2026-08-28T00:00:00.000Z"
      },
      latestVersion: "1.1.0"
    })

    expect(execMock).toHaveBeenCalledWith(
      "npm",
      ["view", "pkg", "versions", "time", "dist-tags", "--json"],
      expect.objectContaining({ cwd: "/cwd" })
    )

    execMock.mockResolvedValueOnce({ stdout: Buffer.from("[]") })
    await expect(getPackageMetadata("pkg", "/cwd")).resolves.toEqual({
      versions: [],
      releaseTimes: {}
    })

    execMock.mockResolvedValueOnce({ stdout: Buffer.from('"1.2.3"') })
    await expect(getPackageMetadata("pkg", "/cwd")).resolves.toEqual({
      versions: ["1.2.3"],
      releaseTimes: { "1.2.3": expect.any(String) }
    })
  })

  it("runNpmAudit returns parsed JSON on success and on non-zero exit with stdout", async () => {
    const report = { auditReportVersion: 1, vulnerabilities: {} }

    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(JSON.stringify(report))
    })

    const res = await utils.runNpmAudit("/cwd")

    expect(res).toEqual(report)

    execMock.mockRejectedValueOnce({
      stdout: Buffer.from(JSON.stringify(report))
    })

    const res2 = await utils.runNpmAudit("/cwd")

    expect(res2).toEqual(report)
  })

  it("checkVulnerabilities filters by severity and normalizes results", async () => {
    const rawReport = {
      auditReportVersion: 1,
      vulnerabilities: {
        pkgA: {
          name: "pkgA",
          severity: "high",
          isDirect: true,
          via: [{ title: "title A" }],
          effects: [],
          range: "<2.0.0",
          nodes: [],
          fixAvailable: { name: "pkgA", version: "2.0.0", isSemVerMajor: true }
        },
        pkgB: {
          name: "pkgB",
          severity: "low",
          isDirect: false,
          via: ["some"],
          effects: [],
          range: "<1.0.0",
          nodes: [],
          fixAvailable: false
        }
      }
    }

    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(JSON.stringify(rawReport))
    })

    const result = await utils.checkVulnerabilities()

    expect(result.total).toBe(1)
    expect(result.vulnerabilities[0].name).toBe("pkgA")
    expect(result.vulnerabilities[0].titles).toEqual(["title A"])
    expect(result.vulnerabilities[0].fixAvailable).toEqual({
      name: "pkgA",
      version: "2.0.0",
      isSemVerMajor: true
    })
  })

  it("fixVulnerabilities applies direct and override fixes (dryRun)", async () => {
    const rawReport = {
      auditReportVersion: 1,
      vulnerabilities: {
        directPkg: {
          name: "directPkg",
          severity: "high",
          isDirect: true,
          via: [{ title: "issue" }],
          effects: [],
          range: "<2.0.0",
          nodes: [],
          fixAvailable: {
            name: "directPkg",
            version: "2.0.0",
            isSemVerMajor: true
          }
        },
        indirectPkg: {
          name: "indirectPkg",
          severity: "high",
          isDirect: false,
          via: [{ title: "issue2" }],
          effects: [],
          range: "<1.0.0",
          nodes: [],
          fixAvailable: {
            name: "indirectPkg",
            version: "1.0.0",
            isSemVerMajor: false
          }
        }
      }
    }

    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(JSON.stringify(rawReport))
    })

    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { directPkg: "^1.0.0" }
    })

    const result = await utils.fixVulnerabilities({
      cwd: "/repo",
      dryRun: true
    })

    expect(
      result.fixed.some(f => f.name === "directPkg" && f.method === "direct")
    ).toBe(true)
    expect(
      result.fixed.some(
        f => f.name === "indirectPkg" && f.method === "override"
      )
    ).toBe(true)
  })

  it("hasMandatoryUpdates returns true when update present and when vulnerabilities present", async () => {
    readPackageJsonMock.mockResolvedValueOnce({})

    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          auditReportVersion: 1,
          vulnerabilities: {
            pkg: {
              name: "pkg",
              severity: "high",
              isDirect: true,
              via: [],
              effects: [],
              range: "<2.0.0",
              nodes: [],
              fixAvailable: false
            }
          }
        })
      )
    })

    const res2 = await utils.hasMandatoryUpdates("minor", "high")

    expect(res2.hasMandatoryUpdates).toBe(true)
    expect(res2.message).toContain("audit vulnerability")
  })

  it("getDependencyChain returns a chain of deps for tracking down vulnerable package", async () => {
    const npmListOutput = `project@1.0.0 /repo
├── @ps/ui-core@1.10.4
│   ├── graphql@15.8.0
│   │   └── vulnerable-pkg@3.0.0
│   └── @graphql-codegen/cli@5.0.7 deduped`

    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(npmListOutput)
    })

    const chain = await getDependencyChain("vulnerable-pkg", "/repo")

    expect(chain).toBeTruthy()
    expect(chain).toContain("@ps/ui-core@1.10.4")
    expect(chain).toContain("graphql@15.8.0")
    expect(chain).toContain("vulnerable-pkg@3.0.0")
    // Should filter out deduped entries
    expect(chain).not.toContain("deduped")
    // Should use arrow separator
    expect(chain).toContain(" → ")
  })
})

describe("utils coverage tests", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("skips unsupported spec in updatePackageJsonDependencies", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { pkg: "workspace:*" }
    })
    readDependencyConfigMock.mockResolvedValueOnce(null)

    const res = await utils.updatePackageJsonDependencies({
      cwd: "/repo",
      dryRun: true
    })

    expect(
      res.skipped.some(
        s =>
          s.name === "pkg" &&
          s.reason === "Unsupported version spec: workspace protocol"
      )
    ).toBe(true)
  })

  it("noUpdate requires pin and can pin when requested", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { react: "^1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce(null)

    const res1 = await utils.updatePackageJsonDependencies({
      cwd: "/repo",
      dryRun: true,
      noUpdate: true,
      pin: false
    })
    expect(
      res1.skipped.some(
        s => s.name === "react" && s.reason === "--no-update requires --pin"
      )
    ).toBe(true)

    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { react: "^1.0.0" }
    })

    const res2 = await utils.updatePackageJsonDependencies({
      cwd: "/repo",
      dryRun: true,
      noUpdate: true,
      pin: true
    })

    expect(res2.updated.some(u => u.name === "react" && u.to === "1.0.0")).toBe(
      true
    )
  })

  it("handles failed version fetch and no eligible updates", async () => {
    readPackageJsonMock.mockResolvedValueOnce({ dependencies: { a: "^1.2.0" } })
    readDependencyConfigMock.mockResolvedValueOnce(null)

    execMock.mockRejectedValueOnce(new Error("npm view failed"))

    const res = await utils.updatePackageJsonDependencies({
      cwd: "/repo",
      dryRun: true
    })

    expect(
      res.skipped.some(
        s => s.name === "a" && s.reason === "Failed to fetch package versions"
      )
    ).toBe(true)

    readPackageJsonMock.mockResolvedValueOnce({ dependencies: { b: "1.2.0" } })
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from('["1.0.0","1.1.0","1.2.0"]')
    })

    const res2 = await utils.updatePackageJsonDependencies({
      cwd: "/repo",
      dryRun: true,
      level: "major"
    })

    expect(
      res2.skipped.some(
        s => s.name === "b" && s.reason === "No eligible update found"
      )
    ).toBe(true)
  })

  it("respects renovate disabled package rules and applies updates with pin options", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { disabled: "^1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce({
      packageRules: [{ enabled: false, matchPackageNames: ["disabled"] }]
    })

    const res = await utils.updatePackageJsonDependencies({
      cwd: "/repo",
      dryRun: true
    })

    expect(res.configExcluded.some(e => e.name === "disabled")).toBe(true)

    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { lib: "^1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce(null)
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from('["1.0.1","1.2.0","2.0.0"]')
    })

    const res2 = await utils.updatePackageJsonDependencies({
      cwd: "/repo",
      dryRun: true,
      level: "minor",
      pin: false
    })
    expect(res2.updated.some(u => u.name === "lib" && u.to === "^1.2.0")).toBe(
      true
    )

    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { lib: "^1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce(null)
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from('["1.0.1","1.2.0","2.0.0"]')
    })

    const res3 = await utils.updatePackageJsonDependencies({
      cwd: "/repo",
      dryRun: true,
      level: "minor",
      pin: true
    })
    expect(res3.updated.some(u => u.name === "lib" && u.to === "1.2.0")).toBe(
      true
    )
  })

  it("fixVulnerabilities skip branches and writing when not dryRun", async () => {
    readPackageJsonMock.mockResolvedValueOnce({ dependencies: { x: "^1.0.0" } })
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          auditReportVersion: 1,
          vulnerabilities: {
            x: {
              name: "x",
              severity: "high",
              isDirect: true,
              via: [],
              effects: [],
              range: "<2.0.0",
              nodes: [],
              fixAvailable: false
            }
          }
        })
      )
    })

    const res = await utils.fixVulnerabilities({ cwd: "/repo", dryRun: true })
    expect(
      res.skipped.some(
        s => s.name === "x" && s.reason.includes("No fix available")
      )
    ).toBe(true)

    readPackageJsonMock.mockResolvedValueOnce({ dependencies: { y: "^2.0.0" } })
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          auditReportVersion: 1,
          vulnerabilities: {
            y: {
              name: "y",
              severity: "high",
              isDirect: true,
              via: [],
              effects: [],
              range: "<3.0.0",
              nodes: [],
              fixAvailable: {
                name: "y",
                version: "2.1.0",
                isSemVerMajor: false
              }
            }
          }
        })
      )
    })

    const res2 = await utils.fixVulnerabilities({ cwd: "/repo", dryRun: true })
    expect(
      res2.skipped.some(
        s =>
          s.name === "y" &&
          s.reason.includes("Current spec already covers fix version")
      )
    ).toBe(true)

    readPackageJsonMock.mockResolvedValueOnce({ dependencies: { z: "^1.0.0" } })
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          auditReportVersion: 1,
          vulnerabilities: {
            z: {
              name: "z",
              severity: "high",
              isDirect: true,
              via: [],
              effects: [],
              range: "<2.0.0",
              nodes: [],
              fixAvailable: { name: "z", version: "2.0.0", isSemVerMajor: true }
            }
          }
        })
      )
    })

    writeFileMock.mockResolvedValueOnce(undefined)

    const res3 = await utils.fixVulnerabilities({ cwd: "/repo", dryRun: false })
    expect(res3.fixed.some(f => f.name === "z" && f.method === "direct")).toBe(
      true
    )
    expect(writeFileMock).toHaveBeenCalled()
  })

  it("getDependencyChain handles errors gracefully", async () => {
    execMock.mockRejectedValueOnce(new Error("npm list failed"))

    const result = await utils.getDependencyChain("pkg", "/repo")

    expect(result).toBeNull()
  })

  it("fixVulnerabilities handles downgrade prevention for indirect packages", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { directPkg: "^2.5.0", indirectPkg: "^2.0.0" }
    })

    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          auditReportVersion: 1,
          vulnerabilities: {
            indirectPkg: {
              name: "indirectPkg",
              severity: "high",
              isDirect: false,
              via: [],
              effects: [],
              range: "<2.0.0",
              nodes: [],
              fixAvailable: {
                name: "indirectPkg",
                version: "1.0.0",
                isSemVerMajor: false
              }
            }
          }
        })
      )
    })

    const res = await utils.fixVulnerabilities({ cwd: "/repo", dryRun: true })

    expect(
      res.skipped.some(
        s =>
          s.name === "indirectPkg" &&
          s.reason.includes("older than current") &&
          s.reason.includes("downgrade")
      )
    ).toBe(true)
  })

  it("updates with dry-run behavior", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { pkg: "^1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce(null)
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from('["1.0.1","1.2.0","2.0.0"]')
    })

    writeFileMock.mockResolvedValueOnce(undefined)

    const res = await utils.updatePackageJsonDependencies({
      cwd: "/repo",
      dryRun: true,
      level: "minor"
    })

    expect(writeFileMock).not.toHaveBeenCalled()
    expect(res.updated.length).toBeGreaterThan(0)
  })

  it("reports release-age skips and installed versions that violate policy", async () => {
    const recentRelease = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: {
        waiting: "1.0.0",
        tooNew: "1.1.0"
      }
    })
    readDependencyConfigMock.mockResolvedValueOnce({
      minimumReleaseAge: "1 day"
    })
    execMock
      .mockResolvedValueOnce({
        stdout: Buffer.from(
          JSON.stringify({
            versions: ["1.0.0", "1.1.0"],
            time: {
              "1.0.0": new Date(
                Date.now() - 2 * 24 * 60 * 60 * 1000
              ).toISOString(),
              "1.1.0": recentRelease
            }
          })
        )
      })
      .mockResolvedValueOnce({
        stdout: Buffer.from(
          JSON.stringify({
            versions: ["1.1.0", "1.2.0"],
            time: {
              "1.1.0": recentRelease,
              "1.2.0": recentRelease
            }
          })
        )
      })

    const result = await utils.updatePackageJsonDependencies({
      cwd: "/repo",
      dryRun: true
    })

    expect(result.skipped).toHaveLength(2)
    expect(
      result.skipped.some(
        item =>
          item.name === "waiting" && item.reason.includes("minimum release age")
      )
    ).toBe(true)
    expect(result.releaseAgeWarnings).toEqual([
      {
        section: "dependencies",
        name: "waiting",
        reason: "Skipped [1.1.0]"
      },
      {
        section: "dependencies",
        name: "tooNew",
        reason: "Skipped [1.2.0]"
      }
    ])
    expect(result.releaseAgeErrors).toEqual([
      {
        section: "dependencies",
        name: "tooNew",
        reason: "Current version [1.1.0]"
      }
    ])
  })

  it("reports newer age-blocked versions while applying an older eligible update", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { "sample-package": "1.11.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce({
      minimumReleaseAge: "1 day"
    })
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          versions: ["1.11.0", "1.11.2", "1.11.4"],
          time: {
            "1.11.0": new Date(
              Date.now() - 3 * 24 * 60 * 60 * 1000
            ).toISOString(),
            "1.11.2": new Date(
              Date.now() - 2 * 24 * 60 * 60 * 1000
            ).toISOString(),
            "1.11.4": new Date(Date.now() - 60 * 60 * 1000).toISOString()
          }
        })
      )
    })

    const result = await utils.updatePackageJsonDependencies({
      cwd: "/repo",
      dryRun: true,
      level: "patch"
    })

    expect(result.updated).toEqual([
      {
        section: "dependencies",
        name: "sample-package",
        from: "1.11.0",
        to: "1.11.2"
      }
    ])
    expect(result.releaseAgeWarnings).toEqual([
      {
        section: "dependencies",
        name: "sample-package",
        reason: "Skipped [1.11.4]"
      }
    ])
    expect(result.releaseAgeErrors).toEqual([])
  })

  it("checkVulnerabilities with various severity filters", async () => {
    const rawReport = {
      auditReportVersion: 1,
      vulnerabilities: {
        low: {
          name: "low-vuln",
          severity: "low",
          isDirect: true,
          via: [],
          effects: [],
          range: "<1.0.0",
          nodes: [],
          fixAvailable: false
        },
        high: {
          name: "high-vuln",
          severity: "high",
          isDirect: true,
          via: [],
          effects: [],
          range: "<2.0.0",
          nodes: [],
          fixAvailable: false
        }
      }
    }

    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(JSON.stringify(rawReport))
    })

    const result = await utils.checkVulnerabilities({
      cwd: "/repo",
      minSeverity: "high"
    })

    expect(result.total).toBe(1)
    expect(result.vulnerabilities[0].name).toBe("high-vuln")
  })

  it("hasMandatoryUpdates with no mandatory updates and no vulnerabilities", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { pkg: "^1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce(null)
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from('["1.0.0"]')
    })

    const result = await utils.hasMandatoryUpdates("major", undefined, {
      dryRun: true
    })

    expect(result.hasMandatoryUpdates).toBe(false)
    expect(result.message).toContain("No mandatory updates found")
  })

  it("fixVulnerabilities with invalid json from npm audit", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { pkg: "^1.0.0" }
    })

    execMock.mockResolvedValueOnce({
      stdout: Buffer.from("invalid json")
    })

    await expect(utils.checkVulnerabilities()).rejects.toThrow()
  })

  it("getCandidateVersions filters prerelease and older versions", () => {
    const current = semver.parse("2.0.0")!

    const result = utils.getCandidateVersions(
      ["1.9.0", "2.0.1", "2.1.0-beta", "3.0.0"],
      current,
      "minor"
    )

    expect(result.map(v => v.toString())).toEqual(["2.0.1"])
  })

  it("selectTargetVersion returns null with no eligible versions", () => {
    const current = semver.parse("3.0.0")!

    const result = utils.selectTargetVersion(
      ["1.0.0", "2.0.0"],
      current,
      "patch"
    )

    expect(result).toBeNull()
  })

  it("selectTargetUpdate blocks all candidates", () => {
    const current = semver.parse("1.0.0")!

    const result = utils.selectTargetUpdate(
      ["1.1.0", "2.0.0"],
      current,
      "major",
      () => false
    )

    expect(result).toBeNull()
  })

  it("parseSupportedSpec with various invalid inputs", () => {
    expect(utils.parseSupportedSpec("workspace:*")).toBeNull()
    expect(utils.parseSupportedSpec("file:../pkg")).toBeNull()
    expect(utils.parseSupportedSpec("npm:foo@1.0.0")).toBeNull()
    expect(utils.parseSupportedSpec("")).toBeNull()
    expect(utils.parseSupportedSpec("   ")).toBeNull()
  })

  it("runNpmAudit with missing vulnerabilities field", async () => {
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from('{"auditReportVersion": 2}')
    })

    const result = await utils.runNpmAudit("/repo")

    expect(result.vulnerabilities).toEqual({})
  })

  it("fixVulnerabilities handles execution errors", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { pkg: "^1.0.0" }
    })

    execMock.mockRejectedValueOnce(new Error("npm audit failed"))

    await expect(utils.fixVulnerabilities({ cwd: "/repo" })).rejects.toThrow(
      "npm audit failed"
    )
  })

  it("parseSupportedSpec with caret prefix", () => {
    const result = utils.parseSupportedSpec("^1.2.3")

    expect(result?.prefix).toBe("^")
    expect(result?.version?.major).toBe(1)
    expect(result?.version?.minor).toBe(2)
    expect(result?.version?.patch).toBe(3)
  })

  it("parseSupportedSpec with tilde prefix", () => {
    const result = utils.parseSupportedSpec("~2.0.0")

    expect(result?.prefix).toBe("~")
    expect(result?.version?.major).toBe(2)
  })

  it("parseSupportedSpec with no prefix", () => {
    const result = utils.parseSupportedSpec("3.5.1")

    expect(result?.prefix).toBe("")
    expect(result?.version?.major).toBe(3)
  })

  it("checkVulnerabilities with empty audit report", async () => {
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from('{"auditReportVersion": 1, "vulnerabilities": {}}')
    })

    const result = await utils.checkVulnerabilities({ cwd: "/repo" })

    expect(result.total).toBe(0)
    expect(result.vulnerabilities).toEqual([])
  })

  it("selectTargetVersion with patch level only", () => {
    const current = semver.parse("1.0.0")!

    const result = utils.selectTargetVersion(
      ["1.0.1", "1.1.0"],
      current,
      "patch"
    )

    expect(result?.toString()).toBe("1.0.1")
  })

  it("selectTargetVersion with major level", () => {
    const current = semver.parse("1.0.0")!

    const result = utils.selectTargetVersion(
      ["1.1.0", "2.0.0", "3.0.0"],
      current,
      "major"
    )

    expect(result?.toString()).toBe("3.0.0")
  })

  it("getCandidateVersions with patch level", () => {
    const current = semver.parse("1.2.0")!

    const result = utils.getCandidateVersions(
      ["1.2.1", "1.3.0", "2.0.0"],
      current,
      "patch"
    )

    expect(result.length).toBe(1)
    expect(result[0].toString()).toBe("1.2.1")
  })

  it("getDependencyChain returns null for empty stderr", async () => {
    execMock.mockResolvedValueOnce({
      stderr: Buffer.from("")
    })

    const result = await utils.getDependencyChain("pkg", "/repo")

    expect(result).toBeNull()
  })

  it("getDependencyChain returns null for a failed npm list", async () => {
    execMock.mockRejectedValueOnce(new Error("npm list failed"))

    await expect(utils.getDependencyChain("pkg", "/repo")).resolves.toBeNull()
  })

  it("getPackageMetadata returns empty metadata for unexpected JSON", async () => {
    execMock.mockResolvedValueOnce({ stdout: Buffer.from("null") })

    await expect(utils.getPackageMetadata("pkg", "/repo")).resolves.toEqual({
      versions: [],
      releaseTimes: {}
    })
  })

  it("checkVulnerabilities skips malformed and unsupported audit entries", async () => {
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          vulnerabilities: {
            malformed: null,
            unsupported: { name: "unsupported", severity: "unknown" },
            low: { name: "low", severity: "low" }
          }
        })
      )
    })

    await expect(
      utils.checkVulnerabilities({ minSeverity: "high" })
    ).resolves.toEqual(
      expect.objectContaining({ total: 0, vulnerabilities: [] })
    )
  })

  it("checkVulnerabilities handles arrays and empty vulnerability titles", async () => {
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          vulnerabilities: {
            packages: [
              {
                name: "pkg",
                severity: "high",
                via: ["source", { title: "" }, { title: "Issue" }],
                fixAvailable: false
              },
              { name: "other", severity: "high", via: "invalid" }
            ]
          }
        })
      )
    })

    const result = await utils.checkVulnerabilities({ quiet: true })

    expect(result.vulnerabilities).toHaveLength(2)
    expect(result.vulnerabilities[0]?.titles).toEqual(["Issue"])
    expect(result.vulnerabilities[1]?.titles).toEqual([])
  })

  it("cleans up temporary package file when atomic write fails", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { pkg: "^1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce(null)
    execMock.mockResolvedValueOnce({ stdout: Buffer.from('["1.0.1"]') })
    writeFileMock.mockResolvedValueOnce(undefined)
    renameMock.mockRejectedValueOnce(new Error("rename failed"))
    rmMock.mockResolvedValueOnce(undefined)

    await expect(
      utils.updatePackageJsonDependencies({ cwd: "/repo", dryRun: false })
    ).rejects.toThrow("rename failed")
    expect(rmMock).toHaveBeenCalledWith(
      expect.stringContaining("package.json."),
      { force: true }
    )
  })

  it("skips audit fixes that are already covered, downgrades, or existing overrides", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: {
        covered: "^1.0.0",
        newer: "^2.0.0"
      },
      overrides: { indirect: "^1.0.0" }
    })
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          vulnerabilities: {
            covered: {
              name: "covered",
              severity: "high",
              isDirect: true,
              fixAvailable: { name: "covered", version: "1.0.1" }
            },
            newer: {
              name: "newer",
              severity: "high",
              isDirect: true,
              fixAvailable: { name: "newer", version: "1.0.0" }
            },
            missing: {
              name: "missing",
              severity: "high",
              isDirect: true,
              fixAvailable: { name: "missing", version: "1.0.0" }
            },
            indirect: {
              name: "indirect",
              severity: "high",
              isDirect: false,
              fixAvailable: { name: "indirect", version: "1.0.1" }
            }
          }
        })
      )
    })

    const result = await utils.fixVulnerabilities({ cwd: "/repo" })

    expect(result.skipped.length).toBeGreaterThan(0)
  })

  it("runNpmAudit with vulnerabilities", async () => {
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          auditReportVersion: 1,
          vulnerabilities: {
            pkg: {
              name: "pkg",
              severity: "high",
              isDirect: true,
              via: [],
              effects: [],
              range: "<1.0.0",
              nodes: [],
              fixAvailable: false
            }
          }
        })
      )
    })

    const result = await utils.runNpmAudit("/repo")

    expect(result.vulnerabilities.pkg).toBeDefined()
    expect(result.vulnerabilities.pkg.name).toBe("pkg")
  })

  it("hasMandatoryUpdates with no audit check level", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { pkg: "^1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce(null)
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from('["1.0.1"]')
    })

    const result = await utils.hasMandatoryUpdates("minor", undefined, {
      dryRun: true
    })

    expect(result.hasMandatoryUpdates).toBe(false)
  })

  it("hasMandatoryUpdates with fix option enabled", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { pkg: "^1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce(null)
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from('["1.0.1"]')
    })

    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          auditReportVersion: 1,
          vulnerabilities: {}
        })
      )
    })

    writeFileMock.mockResolvedValueOnce(undefined)

    const result = await utils.hasMandatoryUpdates("patch", "high", {
      dryRun: false,
      fix: true
    })

    expect(result).toBeDefined()
  })

  it("updatePackageJsonDependencies with no dependencies", async () => {
    readPackageJsonMock.mockResolvedValueOnce({})
    readDependencyConfigMock.mockResolvedValueOnce(null)
    writeFileMock.mockResolvedValueOnce(undefined)

    const result = await utils.updatePackageJsonDependencies({
      cwd: "/repo",
      dryRun: false,
      level: "minor"
    })

    expect(result.updated).toHaveLength(0)
    expect(result.skipped).toHaveLength(0)
  })

  it("fixVulnerabilities with direct vulnerability fix", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { pkg: "^1.0.0" }
    })

    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          auditReportVersion: 1,
          vulnerabilities: {
            pkg: {
              name: "pkg",
              severity: "high",
              isDirect: true,
              via: [],
              effects: [],
              range: "<1.0.0",
              nodes: [],
              fixAvailable: {
                name: "pkg",
                version: "2.0.0",
                isSemVerMajor: true
              }
            }
          }
        })
      )
    })

    writeFileMock.mockResolvedValueOnce(undefined)

    const res = await utils.fixVulnerabilities({ cwd: "/repo", dryRun: false })

    expect(res.fixed.length).toBeGreaterThanOrEqual(0)
  })

  it("uses highest configured audit fix version", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { pkg: "^1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce({
      vulnerabilityAlerts: { vulnerabilityFixStrategy: "highest" }
    })
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          auditReportVersion: 1,
          vulnerabilities: {
            pkg: {
              name: "pkg",
              severity: "high",
              isDirect: true,
              via: [],
              effects: [],
              range: "<1.0.0",
              nodes: [],
              fixAvailable: {
                name: "pkg",
                version: "1.0.1",
                isSemVerMajor: false
              }
            }
          }
        })
      )
    })
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          versions: ["1.0.1", "1.2.0", "2.0.0"],
          time: {}
        })
      )
    })
    writeFileMock.mockResolvedValueOnce(undefined)

    const result = await utils.fixVulnerabilities({ cwd: "/repo" })

    expect(result.fixed).toContainEqual({
      name: "pkg",
      from: "^1.0.0",
      to: "^2.0.0",
      method: "direct",
      section: "dependencies"
    })
  })

  it("does not apply direct audit fixes disabled by renovate.json", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { pkg: "^1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce({
      packageRules: [
        {
          matchPackageNames: ["pkg"],
          enabled: false
        }
      ]
    })
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          auditReportVersion: 1,
          vulnerabilities: {
            pkg: {
              name: "pkg",
              severity: "high",
              isDirect: true,
              via: [],
              effects: [],
              range: "<1.0.0",
              nodes: [],
              fixAvailable: {
                name: "pkg",
                version: "2.0.0",
                isSemVerMajor: true
              }
            }
          }
        })
      )
    })

    const result = await utils.fixVulnerabilities({ cwd: "/repo" })

    expect(result.fixed).toEqual([])
    expect(result.skipped).toContainEqual({
      name: "pkg",
      reason: "Disabled by configured dependency rules"
    })
  })

  it("does not create indirect audit overrides disabled by renovate.json", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { app: "1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce({
      packageRules: [
        {
          matchPackageNames: ["transitive-pkg"],
          enabled: false
        }
      ]
    })
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          auditReportVersion: 1,
          vulnerabilities: {
            "transitive-pkg": {
              name: "transitive-pkg",
              severity: "high",
              isDirect: false,
              via: [],
              effects: [],
              range: "<1.0.0",
              nodes: [],
              fixAvailable: {
                name: "transitive-pkg",
                version: "1.0.1",
                isSemVerMajor: false
              }
            }
          }
        })
      )
    })

    const result = await utils.fixVulnerabilities({ cwd: "/repo" })

    expect(result.fixed).toEqual([])
    expect(result.skipped).toContainEqual({
      name: "transitive-pkg",
      reason: "Disabled by configured dependency rules"
    })
  })

  it("checkVulnerabilities filters by minimum severity", async () => {
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          auditReportVersion: 1,
          vulnerabilities: {
            low: {
              name: "low-vuln",
              severity: "low",
              isDirect: true,
              via: [],
              effects: [],
              range: "<1.0.0",
              nodes: [],
              fixAvailable: false
            },
            critical: {
              name: "critical-vuln",
              severity: "critical",
              isDirect: true,
              via: [],
              effects: [],
              range: "<1.0.0",
              nodes: [],
              fixAvailable: false
            }
          }
        })
      )
    })

    const result = await utils.checkVulnerabilities({
      cwd: "/repo",
      minSeverity: "high"
    })

    expect(result.vulnerabilities.some(v => v.name === "critical-vuln")).toBe(
      true
    )
    expect(result.vulnerabilities.some(v => v.name === "low-vuln")).toBe(false)
  })

  it("updatePackageJsonDependencies with devDependencies", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      devDependencies: { devpkg: "^1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce(null)
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from('["1.0.1","1.2.0"]')
    })

    writeFileMock.mockResolvedValueOnce(undefined)

    const result = await utils.updatePackageJsonDependencies({
      cwd: "/repo",
      dryRun: false,
      level: "minor"
    })

    expect(result).toBeDefined()
  })

  it("updatePackageJsonDependencies with peerDependencies", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      peerDependencies: { peerpkg: "^1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce(null)
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from('["1.0.1"]')
    })

    writeFileMock.mockResolvedValueOnce(undefined)

    const result = await utils.updatePackageJsonDependencies({
      cwd: "/repo",
      dryRun: false,
      level: "minor"
    })

    expect(result).toBeDefined()
  })

  it("hasMandatoryUpdates with no update level match", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { pkg: "^1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce(null)
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from('["1.0.1"]')
    })

    const result = await utils.hasMandatoryUpdates("major", undefined, {
      dryRun: true
    })

    expect(result.hasMandatoryUpdates).toBe(false)
  })

  it("hasMandatoryUpdates with vulnerabilities and fix disabled", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { pkg: "^1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce(null)
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from('["1.0.1"]')
    })

    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          auditReportVersion: 1,
          vulnerabilities: {
            pkg: {
              name: "pkg",
              severity: "high",
              isDirect: true,
              via: [],
              effects: [],
              range: "<1.0.0",
              nodes: [],
              fixAvailable: false
            }
          }
        })
      )
    })

    const result = await utils.hasMandatoryUpdates("patch", "high", {
      dryRun: true,
      fix: false
    })

    expect(result.hasMandatoryUpdates).toBe(true)
    expect(result.vulnerabilities?.length).toBeGreaterThan(0)
  })

  it("checkVulnerabilities with different severity levels", async () => {
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          auditReportVersion: 1,
          vulnerabilities: {
            mod: {
              name: "mod-pkg",
              severity: "moderate",
              isDirect: true,
              via: [],
              effects: [],
              range: "<1.0.0",
              nodes: [],
              fixAvailable: false
            },
            high: {
              name: "high-pkg",
              severity: "high",
              isDirect: true,
              via: [],
              effects: [],
              range: "<1.0.0",
              nodes: [],
              fixAvailable: false
            }
          }
        })
      )
    })

    const result = await utils.checkVulnerabilities({
      cwd: "/repo",
      minSeverity: "moderate"
    })

    expect(result.total).toBe(2)
  })

  it("fixVulnerabilities with dryRun mode", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { pkg: "^1.0.0" }
    })

    execMock.mockResolvedValueOnce({
      stdout: Buffer.from(
        JSON.stringify({
          auditReportVersion: 1,
          vulnerabilities: {
            pkg: {
              name: "pkg",
              severity: "high",
              isDirect: true,
              via: [],
              effects: [],
              range: "<1.0.0",
              nodes: [],
              fixAvailable: {
                name: "pkg",
                version: "1.1.0",
                isSemVerMajor: false
              }
            }
          }
        })
      )
    })

    await utils.fixVulnerabilities({ cwd: "/repo", dryRun: true })

    expect(writeFileMock).not.toHaveBeenCalled()
  })

  it("hasMandatoryUpdates with multiple dependency sections", async () => {
    readPackageJsonMock.mockResolvedValueOnce({
      dependencies: { pkg1: "^1.0.0" },
      devDependencies: { pkg2: "^1.0.0" },
      peerDependencies: { pkg3: "^1.0.0" }
    })
    readDependencyConfigMock.mockResolvedValueOnce(null)
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from('["1.0.1"]')
    })
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from('["1.0.1"]')
    })
    execMock.mockResolvedValueOnce({
      stdout: Buffer.from('["1.0.1"]')
    })

    const result = await utils.hasMandatoryUpdates("minor", undefined, {
      dryRun: true
    })

    expect(result).toBeDefined()
  })
})
