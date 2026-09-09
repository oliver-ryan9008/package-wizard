import type { RenovateConfig, RenovatePackageRule } from "../types"
import {
  doesRuleMatch,
  doesRuleMatchUpdateType,
  getExplicitlyAllowedUpdateTypes,
  getMatchingPackageRules,
  hasExplicitAllowRules,
  isPackageDisabledByMatchingRules,
  isPackageDisabledByRenovateConfig,
  isPackageIgnoredByRenovateConfig,
  isUpdateBlockedByDisabledRules,
  isUpdateBlockedByExplicitAllowRules,
  isUpdateDisabledByMatchingRules,
  isUpdateDisabledByRenovateConfig,
  isUpdateWithinRequestedLevel,
  isVersionAllowedByRenovateConfig,
  packageMatchesRule,
  shouldIgnoreUnstableByRenovateConfig,
  shouldRespectLatestByRenovateConfig,
  shouldSkipUpdate,
  shouldUpdatePinnedDependencyByRenovateConfig
} from "./renovate-utils"

describe("renovate-utils", () => {
  describe("isUpdateWithinRequestedLevel", () => {
    it("allows patch when patch requested", () => {
      expect(isUpdateWithinRequestedLevel("patch", "patch")).toBe(true)
    })

    it("allows patch when minor requested", () => {
      expect(isUpdateWithinRequestedLevel("patch", "minor")).toBe(true)
    })

    it("allows minor when major requested", () => {
      expect(isUpdateWithinRequestedLevel("minor", "major")).toBe(true)
    })

    it("blocks minor when patch requested", () => {
      expect(isUpdateWithinRequestedLevel("minor", "patch")).toBe(false)
    })

    it("blocks major when minor requested", () => {
      expect(isUpdateWithinRequestedLevel("major", "minor")).toBe(false)
    })
  })

  describe("doesRuleMatchUpdateType", () => {
    it("matches when no update types are specified", () => {
      expect(doesRuleMatchUpdateType({}, "major")).toBe(true)
    })

    it("matches allowed update type", () => {
      expect(
        doesRuleMatchUpdateType(
          {
            matchUpdateTypes: ["major"]
          },
          "major"
        )
      ).toBe(true)
    })

    it("does not match different update type", () => {
      expect(
        doesRuleMatchUpdateType(
          {
            matchUpdateTypes: ["major"]
          },
          "minor"
        )
      ).toBe(false)
    })
  })

  describe("packageMatchesRule", () => {
    it("matches when no package matchers exist", () => {
      expect(packageMatchesRule("react", "dependencies", {})).toBe(true)
    })

    it("matches package name", () => {
      expect(
        packageMatchesRule("react", "dependencies", {
          matchPackageNames: ["react"]
        })
      ).toBe(true)
    })

    it("does not match different package name", () => {
      expect(
        packageMatchesRule("react", "dependencies", {
          matchPackageNames: ["lodash"]
        })
      ).toBe(false)
    })

    it("matches package pattern", () => {
      expect(
        packageMatchesRule("@types/node", "devDependencies", {
          matchPackagePatterns: ["^@types/"]
        })
      ).toBe(true)
    })

    it("matches package prefix", () => {
      expect(
        packageMatchesRule("@internal/runtime", "dependencies", {
          matchPackagePrefixes: ["@internal/"]
        })
      ).toBe(true)
    })

    it("enforces dependency section matching", () => {
      expect(
        packageMatchesRule("react", "dependencies", {
          matchDepTypes: ["devDependencies"]
        })
      ).toBe(false)
    })

    it("matches when dependency section matches", () => {
      expect(
        packageMatchesRule("react", "devDependencies", {
          matchDepTypes: ["devDependencies"]
        })
      ).toBe(true)
    })

    it("does not match when pattern and prefix do not match", () => {
      expect(
        packageMatchesRule("react", "dependencies", {
          matchPackagePatterns: ["^@types/"],
          matchPackagePrefixes: ["@internal/"]
        })
      ).toBe(false)
    })
  })

  describe("doesRuleMatch", () => {
    it("matches package and update type", () => {
      expect(
        doesRuleMatch(
          {
            matchPackageNames: ["react"],
            matchUpdateTypes: ["major"]
          },
          "react",
          "major",
          "dependencies"
        )
      ).toBe(true)
    })

    it("fails when update type does not match", () => {
      expect(
        doesRuleMatch(
          {
            matchPackageNames: ["react"],
            matchUpdateTypes: ["major"]
          },
          "react",
          "minor",
          "dependencies"
        )
      ).toBe(false)
    })
  })

  describe("getMatchingPackageRules", () => {
    it("returns only matching rules", () => {
      const config: RenovateConfig = {
        packageRules: [
          {
            matchPackageNames: ["react"]
          },
          {
            matchPackageNames: ["lodash"]
          }
        ]
      }

      expect(getMatchingPackageRules(config, "react", "dependencies")).toEqual([
        {
          matchPackageNames: ["react"]
        }
      ])
    })

    it("returns empty array when config is null", () => {
      expect(getMatchingPackageRules(null, "react", "dependencies")).toEqual([])
    })
  })

  describe("isPackageDisabledByMatchingRules", () => {
    it("returns true for package-level disabled rule", () => {
      expect(
        isPackageDisabledByMatchingRules([
          {
            enabled: false,
            matchPackageNames: ["react"]
          }
        ])
      ).toBe(true)
    })

    it("ignores update-type-specific disabled rules", () => {
      expect(
        isPackageDisabledByMatchingRules([
          {
            enabled: false,
            matchPackageNames: ["react"],
            matchUpdateTypes: ["major"]
          }
        ])
      ).toBe(false)
    })

    it("returns false when no rules disable package", () => {
      expect(
        isPackageDisabledByMatchingRules([
          {
            enabled: true
          }
        ])
      ).toBe(false)
    })
  })

  describe("isPackageDisabledByRenovateConfig", () => {
    it("returns true when matching package disabled rule exists", () => {
      expect(
        isPackageDisabledByRenovateConfig(
          {
            packageRules: [
              {
                enabled: false,
                matchPackageNames: ["react"]
              }
            ]
          },
          "react",
          "dependencies"
        )
      ).toBe(true)
    })

    it("returns false when package is not matched", () => {
      expect(
        isPackageDisabledByRenovateConfig(
          {
            packageRules: [
              {
                enabled: false,
                matchPackageNames: ["lodash"]
              }
            ]
          },
          "react",
          "dependencies"
        )
      ).toBe(false)
    })
  })

  describe("isVersionAllowedByRenovateConfig", () => {
    it("allows versions inside configured range", () => {
      expect(
        isVersionAllowedByRenovateConfig(
          {
            packageRules: [
              { matchPackageNames: ["react"], allowedVersions: ">=18 <20" }
            ]
          },
          "react",
          "19.0.0",
          "dependencies"
        )
      ).toBe(true)
    })

    it("blocks versions outside configured range", () => {
      expect(
        isVersionAllowedByRenovateConfig(
          {
            packageRules: [
              { matchPackageNames: ["react"], allowedVersions: "<19" }
            ]
          },
          "react",
          "19.0.0",
          "dependencies"
        )
      ).toBe(false)
    })

    it("supports positive regex rules", () => {
      expect(
        isVersionAllowedByRenovateConfig(
          { packageRules: [{ allowedVersions: "/^2\\./" }] },
          "react",
          "2.1.0",
          "dependencies"
        )
      ).toBe(true)
    })

    it("rejects versions that do not match regex rules", () => {
      expect(
        isVersionAllowedByRenovateConfig(
          { packageRules: [{ allowedVersions: "/^2\\./" }] },
          "react",
          "1.9.0",
          "dependencies"
        )
      ).toBe(false)
    })

    it("throws for invalid allowed-version regex", () => {
      expect(() =>
        isVersionAllowedByRenovateConfig(
          { packageRules: [{ allowedVersions: "/[/" }] },
          "react",
          "1.0.0",
          "dependencies"
        )
      ).toThrow("Invalid allowedVersions pattern")
    })
  })

  describe("Renovate policy defaults and overrides", () => {
    it("ignores packages listed in ignoreDeps", () => {
      expect(
        isPackageIgnoredByRenovateConfig({ ignoreDeps: ["react"] }, "react")
      ).toBe(true)
      expect(isPackageIgnoredByRenovateConfig(null, "react")).toBe(false)
    })

    it("uses root defaults and matching package-rule overrides", () => {
      const config: RenovateConfig = {
        ignoreUnstable: false,
        respectLatest: false,
        updatePinnedDependencies: false,
        packageRules: [
          {
            matchPackageNames: ["react"],
            ignoreUnstable: true,
            respectLatest: true,
            updatePinnedDependencies: true
          }
        ]
      }

      expect(
        shouldIgnoreUnstableByRenovateConfig(config, "react", "dependencies")
      ).toBe(true)
      expect(
        shouldRespectLatestByRenovateConfig(config, "react", "dependencies")
      ).toBe(true)
      expect(
        shouldUpdatePinnedDependencyByRenovateConfig(
          config,
          "react",
          "dependencies"
        )
      ).toBe(true)
      expect(
        shouldIgnoreUnstableByRenovateConfig(config, "lodash", "dependencies")
      ).toBe(false)
      expect(
        shouldRespectLatestByRenovateConfig(null, "lodash", "dependencies")
      ).toBe(true)
      expect(
        shouldUpdatePinnedDependencyByRenovateConfig(
          null,
          "lodash",
          "dependencies"
        )
      ).toBe(true)
    })
  })

  describe("explicit allow rules", () => {
    const rules: RenovatePackageRule[] = [
      {
        enabled: true,
        matchUpdateTypes: ["patch", "minor"]
      }
    ]

    it("detects explicit allow rules", () => {
      expect(hasExplicitAllowRules(rules)).toBe(true)
    })

    it("collects allowed update types", () => {
      expect(getExplicitlyAllowedUpdateTypes(rules)).toEqual(
        new Set(["patch", "minor"])
      )
    })

    it("allows explicitly allowed type", () => {
      expect(isUpdateBlockedByExplicitAllowRules(rules, "minor")).toBe(false)
    })

    it("blocks unlisted update type", () => {
      expect(isUpdateBlockedByExplicitAllowRules(rules, "major")).toBe(true)
    })
  })

  describe("disabled update type rules", () => {
    const rules: RenovatePackageRule[] = [
      {
        enabled: false,
        matchUpdateTypes: ["major"]
      }
    ]

    it("blocks matching update type", () => {
      expect(isUpdateBlockedByDisabledRules(rules, "major")).toBe(true)
    })

    it("does not block other update types", () => {
      expect(isUpdateBlockedByDisabledRules(rules, "minor")).toBe(false)
    })
  })

  describe("isUpdateDisabledByMatchingRules", () => {
    it("returns false with no rules", () => {
      expect(isUpdateDisabledByMatchingRules([], "major")).toBe(false)
    })

    it("blocks update excluded by allow list", () => {
      expect(
        isUpdateDisabledByMatchingRules(
          [
            {
              enabled: true,
              matchUpdateTypes: ["minor"]
            }
          ],
          "major"
        )
      ).toBe(true)
    })

    it("blocks update disabled by rule", () => {
      expect(
        isUpdateDisabledByMatchingRules(
          [
            {
              enabled: false,
              matchUpdateTypes: ["major"]
            }
          ],
          "major"
        )
      ).toBe(true)
    })

    it("allows update when rules permit it", () => {
      expect(
        isUpdateDisabledByMatchingRules(
          [
            {
              enabled: true,
              matchUpdateTypes: ["major"]
            }
          ],
          "major"
        )
      ).toBe(false)
    })
  })

  describe("isUpdateDisabledByRenovateConfig", () => {
    it("evaluates matching rules only", () => {
      expect(
        isUpdateDisabledByRenovateConfig(
          {
            packageRules: [
              {
                enabled: false,
                matchPackageNames: ["react"],
                matchUpdateTypes: ["major"]
              }
            ]
          },
          "react",
          "major",
          "dependencies"
        )
      ).toBe(true)
    })
  })

  describe("shouldSkipUpdate", () => {
    it("skips update outside requested level", () => {
      expect(
        shouldSkipUpdate(null, "react", "major", "minor", "dependencies")
      ).toBe(true)
    })

    it("skips update blocked by renovate", () => {
      expect(
        shouldSkipUpdate(
          {
            packageRules: [
              {
                enabled: false,
                matchPackageNames: ["react"],
                matchUpdateTypes: ["major"]
              }
            ]
          },
          "react",
          "major",
          "major",
          "dependencies"
        )
      ).toBe(true)
    })

    it("allows valid update", () => {
      expect(
        shouldSkipUpdate(null, "react", "minor", "minor", "dependencies")
      ).toBe(false)
    })
  })
})
