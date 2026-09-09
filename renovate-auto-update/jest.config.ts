import type { Config } from "jest"

const config: Config = {
  testTimeout: 10000,
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  injectGlobals: true,
  modulePathIgnorePatterns: ["/dist/", "/node_modules/", "/coverage/"],
  coverageDirectory: "coverage",
  collectCoverage: true,
  collectCoverageFrom: [
    "src/**/*.{ts,js}",
    "!src/**/*.test.{ts,js}",
    "!src/**/*.spec.{ts,js}",
    "!src/**/*.d.ts"
  ],
  reporters: [
    "default",
    [
      "jest-sonar",
      {
        outputDirectory: "coverage",
        outputName: "sonar-unit-report.xml",
        reportedFilePath: "relative"
      }
    ]
  ],
  coverageReporters: ["json", "text", "lcov"],
  moduleNameMapper: {
    "^@clack/core$": "<rootDir>/__mocks__/clack-core.ts",
    "^@clack/prompts$": "<rootDir>/__mocks__/clack-prompts.ts",
    "^(\\.\\.?\\/.+)\\.js$": "$1"
  },
  transform: {
    "^.+\\.ts?$": [
      "ts-jest",
      {
        useESM: true
      }
    ]
  }
}

export default config
