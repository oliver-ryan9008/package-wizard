import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const detectPackageManager = (cwd?: string): string => {
  const targetDirectory = cwd ?? process.cwd()
  const packageJsonPath = path.join(targetDirectory, "package.json")
  let configuredManager: unknown

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      packageManager?: unknown
    }
    configuredManager = packageJson.packageManager
  } catch {
    configuredManager = undefined
  }

  if (typeof configuredManager === "string") {
    if (configuredManager.startsWith("pnpm@")) return "pnpm"
    if (configuredManager.startsWith("yarn@")) return "yarn"
    if (configuredManager.startsWith("bun@")) return "bun"
    if (configuredManager.startsWith("npm@")) return "npm"
  }

  const lockfiles: ReadonlyArray<[string, string]> = [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
    ["npm-shrinkwrap.json", "npm"]
  ]

  return (
    lockfiles.find(([lockfile]) =>
      existsSync(path.join(targetDirectory, lockfile))
    )?.[1] ?? "npm"
  )
}

export const getInstallCommand = (cwd?: string): string =>
  `${detectPackageManager(cwd)} install`
