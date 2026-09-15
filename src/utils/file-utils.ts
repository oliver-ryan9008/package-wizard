import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import path from "node:path"
import { promisify } from "node:util"
import type { PackageJson } from "type-fest"
import { parse as parseYaml } from "yaml"
import { readPackageWizardConfigFile } from "../configuration/parse-configs"
import { normalizePackageWizardConfig } from "../configuration/normalize-config"
import { validateFallbackConfig, validatePackageWizardConfig } from "../configuration/validate-config"
import type { DependencyConfig, DependencyRule } from "../types"
import { isRecord } from "./generic-utils"
import { generalLogger, infoLogger } from "../logging-utils/logger"

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

const formatReadPath = (filePath: string): string =>
  `${path.basename(path.dirname(filePath))}/${path.basename(filePath)}`

const isMissingFileError = (error: unknown): boolean =>
  (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") ||
  (error instanceof Error && error.message === "ENOENT")

const readJsonObject = async (filePath: string): Promise<Record<string, unknown> | null> => {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown
    if (!isRecord(parsed)) throw new Error(`${filePath} must contain a JSON object`)
    return parsed
  } catch (error) {
    if (isMissingFileError(error)) return null
    throw error
  }
}

const wildcardToPattern = (value: string): string =>
  `^${value.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`

export type DependencyConfigSource = {
  config: DependencyConfig
  source: string
}

type ConfigReadOptions = { log?: boolean }

const sourceName = (filePath: string): string => path.basename(filePath)

const readPackageWizardConfig = async (cwd: string, options: ConfigReadOptions): Promise<DependencyConfigSource | null> => {
  const loaded = await readPackageWizardConfigFile(cwd)
  if (loaded === null) return null
  validatePackageWizardConfig(loaded.config as unknown as Record<string, unknown>, loaded.path)
  if (options.log !== false) {
    infoLogger(`Read dependency configuration from ${formatReadPath(loaded.path)}`)
    generalLogger("")
  }
  return { config: normalizePackageWizardConfig(loaded.config), source: sourceName(loaded.path) }
}

const readNpmCheckUpdatesConfig = async (cwd: string, options: ConfigReadOptions): Promise<DependencyConfigSource | null> => {
  const configPath = path.join(cwd, ".ncurc.json")
  const parsed = await readJsonObject(configPath)
  if (parsed === null) return null
  const rejectValues =
    parsed.reject === undefined
      ? []
      : Array.isArray(parsed.reject)
        ? parsed.reject
        : [parsed.reject]
  if (rejectValues.some(value => typeof value !== "string")) {
    throw new Error(`${configPath} reject must be a string or string array`)
  }
  const ignoreDeps = rejectValues.filter(
    (value): value is string => typeof value === "string" && !value.includes("*") && !/^\/.+\/$/.test(value)
  )
  const packageRules: DependencyRule[] = rejectValues
    .filter((value): value is string => typeof value === "string" && (value.includes("*") || /^\/.+\/$/.test(value)))
    .map(value => ({
      matchPackagePatterns: [
        value.startsWith("/") && value.endsWith("/")
          ? value.slice(1, -1)
          : wildcardToPattern(value)
      ],
      enabled: false
    }))
  if (parsed.cooldown !== undefined && typeof parsed.cooldown !== "string" && typeof parsed.cooldown !== "number") {
    throw new Error(`${configPath} cooldown must be a string or number`)
  }
  if (options.log !== false) {
    infoLogger(`Read dependency configuration from ${formatReadPath(configPath)}`)
    generalLogger("")
  }
  return {
    config: {
      ...(ignoreDeps.length > 0 ? { ignoreDeps } : {}),
      ...(packageRules.length > 0 ? { packageRules } : {}),
      minimumReleaseAge: parsed.cooldown === undefined ? "3 days" : parsed.cooldown as string | number
    },
    source: sourceName(configPath)
  }
}

const normalizeRenovateConfig = (parsed: Record<string, unknown>): DependencyConfig => {
  const normalized = { ...parsed } as DependencyConfig
  if (
    normalized.minimumReleaseAgeBehavior === undefined &&
    typeof parsed.minimumReleaseAgeBehaviour === "string"
  ) {
    normalized.minimumReleaseAgeBehavior = parsed.minimumReleaseAgeBehaviour as
      | "timestamp-required"
      | "timestamp-optional"
  }
  return normalized
}

const readDependabotConfig = async (cwd: string, options: ConfigReadOptions): Promise<DependencyConfigSource | null> => {
  const configPath = path.join(cwd, ".github", "dependabot.yml")
  try {
    const parsed = parseYaml(await fs.readFile(configPath, "utf8")) as unknown
    if (!isRecord(parsed)) throw new Error(`${configPath} must contain a YAML object`)
    const packageRules: DependencyRule[] = []
    const updates = Array.isArray(parsed.updates) ? parsed.updates : []
    for (const update of updates) {
      if (!isRecord(update) || !Array.isArray(update.ignore)) continue
      for (const ignored of update.ignore) {
        if (!isRecord(ignored)) continue
        const updateTypes = Array.isArray(ignored["update-types"])
          ? ignored["update-types"].filter((value): value is string => typeof value === "string").map(value => value.replace("version-update:semver-", "")).filter((value): value is "major" | "minor" | "patch" => value === "major" || value === "minor" || value === "patch")
          : []
        const packageName = ignored["dependency-name"]
        if (typeof packageName !== "string" && updateTypes.length === 0) continue
        packageRules.push({
          ...(typeof packageName === "string"
            ? packageName.includes("*")
              ? { matchPackagePatterns: [wildcardToPattern(packageName)] }
              : { matchPackageNames: [packageName] }
            : {}),
          ...(updateTypes.length > 0 ? { matchUpdateTypes: updateTypes } : {}),
          enabled: false
        })
      }
    }
    if (options.log !== false) {
      infoLogger(`Read dependency configuration from ${formatReadPath(configPath)}`)
      generalLogger("")
    }
    return { config: { packageRules, minimumReleaseAge: "3 days" }, source: sourceName(configPath) }
  } catch (error) {
    if (isMissingFileError(error)) return null
    throw error
  }
}

export const readDependencyConfig = async (cwd: string, options: ConfigReadOptions = {}): Promise<DependencyConfig | null> => {
  const loaded = await readDependencyConfigWithSource(cwd, options)
  return loaded?.config ?? null
}

export const readDependencyConfigWithSource = async (
  cwd: string,
  options: ConfigReadOptions = {}
): Promise<DependencyConfigSource | null> => {
  const packageWizardConfig = await readPackageWizardConfig(cwd, options)
  if (packageWizardConfig !== null) return packageWizardConfig

  const renovatePath = path.join(cwd, "renovate.json")
  try {
    const parsed = await readJsonObject(renovatePath)
    if (parsed === null) {
      return (await readNpmCheckUpdatesConfig(cwd, options)) ?? (await readDependabotConfig(cwd, options))
    }
    validateFallbackConfig(parsed, renovatePath)
    if (options.log !== false) {
      infoLogger(`Read dependency configuration from ${formatReadPath(renovatePath)}`)
      generalLogger("")
    }
    return { config: normalizeRenovateConfig(parsed), source: sourceName(renovatePath) }
  } catch (error) {
    if (isMissingFileError(error)) {
      return (await readNpmCheckUpdatesConfig(cwd, options)) ?? (await readDependabotConfig(cwd, options))
    }
    throw error
  }
}

export const readPackageJson = async (
  filePath: string,
  options: { quiet?: boolean } = {}
): Promise<PackageJson> => {
  const raw = await fs.readFile(filePath, "utf8")
  if (!options.quiet) {
    infoLogger(`Read package.json from ${path.basename(path.dirname(filePath))}/package.json`)
    generalLogger("")
  }
  const parsed = JSON.parse(raw) as PackageJson
  if (!isRecord(parsed)) throw new Error(`${filePath} must contain a JSON object`)
  return parsed
}
