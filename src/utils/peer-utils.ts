import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
// import { progress } from "@clack/prompts"
import type { PackageJson } from "type-fest"
import { execFileAsync } from "./file-utils"
import { DEPENDENCY_SECTIONS } from "../types"
import progress from "../logging-utils/progress-bar"

export interface PeerDependencyCheckResult {
  valid: boolean
  message?: string
}

interface PeerCheckOptions {
  quiet?: boolean
}

const dependencyNames = (packageJson: PackageJson): string[] =>
  DEPENDENCY_SECTIONS.flatMap(section => {
    const dependencies = packageJson[section]
    return typeof dependencies === "object" && dependencies !== null
      ? Object.keys(dependencies)
      : []
  })

const dependencySummary = (names: readonly string[]): string =>
  names.length <= 8
    ? names.join(", ")
    : `${names.slice(0, 8).join(", ")} (+${names.length - 8} more)`

export const checkPeerDependencies = async (
  packageJson: PackageJson,
  options: PeerCheckOptions = {}
): Promise<PeerDependencyCheckResult> => {
  const names = dependencyNames(packageJson)
  const progressBar = options.quiet
    ? null
    : progress({ max: 10, style: "heavy" })
  progressBar?.start(
    `Checking peer dependencies for ${names.length} package(s)...`
  )
  let temporaryDirectory: string | undefined

  try {
    temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "package-wizard-peers-")
    )
    const temporaryPackageJson = path.join(temporaryDirectory, "package.json")
    progressBar?.advance(
      3,
      names.length === 0
        ? "Evaluating peer requirements: no dependencies declared"
        : `Evaluating peer requirements: ${dependencySummary(names)}`
    )
    await fs.writeFile(
      temporaryPackageJson,
      `${JSON.stringify(packageJson, null, 2)}\n`,
      "utf8"
    )
    progressBar?.advance(
      3,
      "Running npm peer and engine compatibility resolver..."
    )
    await execFileAsync(
      "npm",
      [
        "install",
        "--package-lock-only",
        "--dry-run",
        "--ignore-scripts",
        "--strict-peer-deps",
        "--engine-strict",
        "--no-audit",
        "--no-fund",
        "--json"
      ],
        { cwd: temporaryDirectory, maxBuffer: 1024 * 1024 * 20 }
    )
    progressBar?.advance(
      4,
      `Peer dependencies compatible (${names.length} package(s) evaluated)`
    )
    progressBar?.stop()
    return { valid: true }
  } catch (error) {
    const details =
      typeof error === "object" && error !== null
        ? "stderr" in error && typeof error.stderr === "string"
          ? error.stderr
          : "stdout" in error && typeof error.stdout === "string"
            ? error.stdout
            : error instanceof Error
              ? error.message
              : String(error)
        : String(error)
    progressBar?.error(
      `Peer dependency conflicts found after evaluating ${names.length} package(s)`
    )
    return {
      valid: false,
      message: details.trim() || "npm found incompatible peer dependencies"
    }
  } finally {
    if (temporaryDirectory) {
      await fs.rm(temporaryDirectory, { recursive: true, force: true })
    }
  }
}

export const checkProjectPeerDependencies = async (
  cwd: string
): Promise<PeerDependencyCheckResult> => {
  const packageJsonPath = path.join(cwd, "package.json")
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as PackageJson
  return checkPeerDependencies(packageJson)
}
