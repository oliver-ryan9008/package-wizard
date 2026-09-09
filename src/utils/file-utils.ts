import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import { promisify } from "node:util"
import type { PackageJson } from "type-fest"
import { RenovateConfig } from "../types"
import { isRecord } from "./generic-utils"
import { infoLogger } from "../logging-utils/logger"

export const writePackageJsonAtomically = async (
  filePath: string,
  packageJson: Record<string, unknown>
): Promise<void> => {
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  const output = `${JSON.stringify(packageJson, null, 2)}\n`

  try {
    await fs.writeFile(temporaryPath, output, "utf8")
    await fs.rename(temporaryPath, filePath)
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

export const execFileAsync = promisify(execFile)

const validatePackageRule = (
  rule: Record<string, unknown>,
  renovatePath: string
): void => {
  const booleanKeys = [
    "enabled",
    "ignoreUnstable",
    "respectLatest",
    "updatePinnedDependencies"
  ]

  for (const key of booleanKeys) {
    if (rule[key] !== undefined && typeof rule[key] !== "boolean") {
      throw new Error(`${renovatePath} packageRules.${key} must be boolean`)
    }
  }

  if (
    rule.allowedVersions !== undefined &&
    typeof rule.allowedVersions !== "string"
  ) {
    throw new Error(
      `${renovatePath} packageRules.allowedVersions must be a string`
    )
  }

  for (const key of [
    "matchPackageNames",
    "matchPackagePatterns",
    "matchPackagePrefixes",
    "matchUpdateTypes",
    "matchDepTypes"
  ]) {
    if (
      rule[key] !== undefined &&
      (!Array.isArray(rule[key]) ||
        rule[key].some(value => typeof value !== "string"))
    ) {
      throw new Error(
        `${renovatePath} packageRules.${key} must be a string array`
      )
    }
  }
}

const validateRenovateConfig = (
  parsed: Record<string, unknown>,
  renovatePath: string
): void => {
  const minimumReleaseAge = parsed.minimumReleaseAge
  if (
    minimumReleaseAge !== undefined &&
    typeof minimumReleaseAge !== "string" &&
    typeof minimumReleaseAge !== "number" &&
    minimumReleaseAge !== false
  ) {
    throw new Error(`${renovatePath} has invalid minimumReleaseAge`)
  }

  const ageBehaviour = parsed.minimumReleaseAgeBehaviour
  if (
    ageBehaviour !== undefined &&
    ageBehaviour !== "timestamp-required" &&
    ageBehaviour !== "timestamp-optional"
  ) {
    throw new Error(`${renovatePath} has invalid minimumReleaseAgeBehaviour`)
  }

  if (
    parsed.ignoreDeps !== undefined &&
    (!Array.isArray(parsed.ignoreDeps) ||
      parsed.ignoreDeps.some(value => typeof value !== "string"))
  ) {
    throw new Error(`${renovatePath} ignoreDeps must be a string array`)
  }

  for (const key of [
    "ignoreUnstable",
    "respectLatest",
    "updatePinnedDependencies"
  ]) {
    if (parsed[key] !== undefined && typeof parsed[key] !== "boolean") {
      throw new Error(`${renovatePath} ${key} must be boolean`)
    }
  }

  const alerts = parsed.vulnerabilityAlerts
  if (
    alerts !== undefined &&
    (!isRecord(alerts) ||
      (alerts.vulnerabilityFixStrategy !== undefined &&
        alerts.vulnerabilityFixStrategy !== "lowest" &&
        alerts.vulnerabilityFixStrategy !== "highest"))
  ) {
    throw new Error(
      `${renovatePath} vulnerabilityAlerts.vulnerabilityFixStrategy must be lowest or highest`
    )
  }

  if (parsed.packageRules === undefined) {
    return
  }

  if (!Array.isArray(parsed.packageRules)) {
    throw new Error(`${renovatePath} packageRules must be an array`)
  }

  for (const rule of parsed.packageRules) {
    if (!isRecord(rule)) {
      throw new Error(`${renovatePath} packageRules must contain objects`)
    }
    validatePackageRule(rule, renovatePath)
  }
}

export const readRenovateConfig = async (
  cwd: string
): Promise<RenovateConfig | null> => {
  const renovatePath = path.join(cwd, "renovate.json")

  try {
    const raw = await fs.readFile(renovatePath, "utf8")
    const parsed = JSON.parse(raw) as unknown

    if (!isRecord(parsed)) {
      throw new Error(`${renovatePath} must contain a JSON object`)
    }

    validateRenovateConfig(parsed, renovatePath)

    return parsed as RenovateConfig
  } catch (error) {
    if (error instanceof Error && error.message.includes("ENOENT")) {
      return null
    }

    if (error instanceof Error) {
      throw error
    }

    return null
  }
}

export const readPackageJson = async (
  filePath: string,
  options: { quiet?: boolean } = {}
): Promise<PackageJson> => {
  const raw = await fs.readFile(filePath, "utf8")

  if (!options.quiet) {
    infoLogger(
      `Read package.json from ${path.basename(path.dirname(filePath))}/package.json`
    )
  }
  const parsed = JSON.parse(raw) as PackageJson

  if (!isRecord(parsed)) {
    throw new Error(`${filePath} must contain a JSON object`)
  }

  return parsed
}
