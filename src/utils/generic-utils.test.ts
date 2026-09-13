import semver from "semver"

import {
  getDependencyRecord,
  getOrCreateStringRecord,
  getUpdateType,
  hasItems,
  isRecord,
  isUpdateEqualToOrGreaterThanLevel,
  isVulnerabilitySeverity,
  stdoutToString
} from "./generic-utils"
import { getPackageChangeUpdateType } from "./package-utils"
import { UpdateLevel } from "../types"
import { PackageJson } from "type-fest"

describe("generic-utils", () => {
  describe("isRecord", () => {
    it("returns true for plain objects", () => {
      expect(isRecord({ foo: "bar" })).toBe(true)
    })

    it("returns false for null", () => {
      expect(isRecord(null)).toBe(false)
    })

    it("returns false for arrays", () => {
      expect(isRecord(["a", "b"])).toBe(false)
    })

    it("returns false for primitives", () => {
      expect(isRecord("test")).toBe(false)
      expect(isRecord(123)).toBe(false)
      expect(isRecord(true)).toBe(false)
    })
  })

  describe("hasItems", () => {
    it("returns true when array contains items", () => {
      expect(hasItems(["a"])).toBe(true)
    })

    it("returns false for empty array", () => {
      expect(hasItems([])).toBe(false)
    })

    it("returns false for undefined", () => {
      expect(hasItems(undefined)).toBe(false)
    })
  })

  describe("isVulnerabilitySeverity", () => {
    it("returns true for valid severities", () => {
      expect(isVulnerabilitySeverity("low")).toBe(true)
      expect(isVulnerabilitySeverity("moderate")).toBe(true)
      expect(isVulnerabilitySeverity("high")).toBe(true)
      expect(isVulnerabilitySeverity("critical")).toBe(true)
    })

    it("returns false for invalid severity", () => {
      expect(isVulnerabilitySeverity("foobar")).toBe(false)
    })
  })

  describe("stdoutToString", () => {
    it("returns string unchanged", () => {
      expect(stdoutToString("hello")).toBe("hello")
    })

    it("converts buffer to string", () => {
      expect(stdoutToString(Buffer.from("hello"))).toBe("hello")
    })
  })

  describe("getDependencyRecord", () => {
    it("returns dependency record when valid", () => {
      const packageJson = {
        dependencies: {
          react: "^19.0.0",
          lodash: "^4.17.21"
        }
      }

      expect(getDependencyRecord(packageJson, "dependencies")).toEqual({
        react: "^19.0.0",
        lodash: "^4.17.21"
      })
    })

    it("returns null when section is missing", () => {
      expect(getDependencyRecord({}, "dependencies")).toBeNull()
    })

    it("returns null when section is not an object", () => {
      expect(
        getDependencyRecord(
          {
            dependencies: ["react"]
          } as unknown as PackageJson,
          "dependencies"
        )
      ).toBeNull()
    })

    it("returns null when dependency values are not strings", () => {
      expect(
        getDependencyRecord(
          {
            dependencies: {
              react: "^19.0.0",
              invalid: 123
            }
          } as unknown as PackageJson,
          "dependencies"
        )
      ).toBeNull()
    })
  })

  describe("getOrCreateStringRecord", () => {
    it("returns existing string entries", () => {
      const target = {
        overrides: {
          react: "^19.0.0",
          lodash: "^4.17.21"
        }
      }

      expect(getOrCreateStringRecord(target, "overrides")).toEqual({
        react: "^19.0.0",
        lodash: "^4.17.21"
      })
    })

    it("filters non-string values", () => {
      const target = {
        overrides: {
          react: "^19.0.0",
          count: 123,
          enabled: true
        }
      }

      expect(getOrCreateStringRecord(target, "overrides")).toEqual({
        react: "^19.0.0"
      })
    })

    it("returns empty object when key does not exist", () => {
      expect(getOrCreateStringRecord({}, "overrides")).toEqual({})
    })

    it("returns empty object when value is not an object", () => {
      expect(
        getOrCreateStringRecord(
          {
            overrides: "invalid"
          },
          "overrides"
        )
      ).toEqual({})
    })
  })

  describe("getUpdateType", () => {
    it("returns patch for patch updates", () => {
      expect(
        getUpdateType(semver.parse("1.0.0")!, semver.parse("1.0.1")!)
      ).toBe(UpdateLevel.Patch)
    })

    it("returns minor for minor updates", () => {
      expect(
        getUpdateType(semver.parse("1.0.0")!, semver.parse("1.1.0")!)
      ).toBe(UpdateLevel.Minor)
    })

    it("returns major for major updates", () => {
      expect(
        getUpdateType(semver.parse("1.0.0")!, semver.parse("2.0.0")!)
      ).toBe(UpdateLevel.Major)
    })
  })

  describe("getPackageChangeUpdateType", () => {
    it("detects patch update", () => {
      expect(
        getPackageChangeUpdateType({
          section: "dependencies",
          name: "react",
          from: "^1.0.0",
          to: "^1.0.1"
        })
      ).toBe(UpdateLevel.Patch)
    })

    it("detects minor update", () => {
      expect(
        getPackageChangeUpdateType({
          section: "dependencies",
          name: "react",
          from: "^1.0.0",
          to: "^1.1.0"
        })
      ).toBe(UpdateLevel.Minor)
    })

    it("detects major update", () => {
      expect(
        getPackageChangeUpdateType({
          section: "dependencies",
          name: "react",
          from: "^1.0.0",
          to: "^2.0.0"
        })
      ).toBe(UpdateLevel.Major)
    })

    it("supports pinned versions", () => {
      expect(
        getPackageChangeUpdateType({
          section: "dependencies",
          name: "react",
          from: "1.0.0",
          to: "2.0.0"
        })
      ).toBe(UpdateLevel.Major)
    })

    it("returns null when from version is invalid", () => {
      expect(
        getPackageChangeUpdateType({
          section: "dependencies",
          name: "react",
          from: "not-a-version",
          to: "2.0.0"
        })
      ).toBeNull()
    })

    it("returns null when to version is invalid", () => {
      expect(
        getPackageChangeUpdateType({
          section: "dependencies",
          name: "react",
          from: "1.0.0",
          to: "not-a-version"
        })
      ).toBeNull()
    })
  })

  describe("isUpdateEqualToOrGreaterThanLevel", () => {
    it("returns true when levels are equal", () => {
      expect(
        isUpdateEqualToOrGreaterThanLevel(UpdateLevel.Minor, UpdateLevel.Minor)
      ).toBe(true)
    })

    it("returns true when update is greater than required level", () => {
      expect(
        isUpdateEqualToOrGreaterThanLevel(UpdateLevel.Major, UpdateLevel.Minor)
      ).toBe(true)
    })

    it("returns true when minor satisfies patch", () => {
      expect(
        isUpdateEqualToOrGreaterThanLevel(UpdateLevel.Minor, UpdateLevel.Patch)
      ).toBe(true)
    })

    it("returns false when update is below required level", () => {
      expect(
        isUpdateEqualToOrGreaterThanLevel(UpdateLevel.Patch, UpdateLevel.Minor)
      ).toBe(false)
    })

    it("returns false when minor is below major", () => {
      expect(
        isUpdateEqualToOrGreaterThanLevel(UpdateLevel.Minor, UpdateLevel.Major)
      ).toBe(false)
    })
  })
})
