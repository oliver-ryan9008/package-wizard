import { promises as fs } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import type { PackageWizardConfigOpts } from "./types"

const configFileNames = [
	"package.wizard.ts",
	"package.wizard.mjs",
	"package.wizard.js",
	"package.wizard.json"
] as const

const isMissingFileError = (error: unknown): boolean =>
	(typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT") ||
	(error instanceof Error && error.message === "ENOENT")

const readConfigModule = async (
	configPath: string
): Promise<PackageWizardConfigOpts> => {
	const module = await import(pathToFileURL(configPath).href)
	const config = module.default ?? module.config

	if (config === undefined) {
		throw new Error(
			`${configPath} must export a default configuration from definePackageWizardConfig`
		)
	}

	return config as PackageWizardConfigOpts
}

export const readPackageWizardConfigFile = async (
	cwd: string
): Promise<{ config: PackageWizardConfigOpts; path: string } | null> => {
	for (const fileName of configFileNames) {
		const configPath = path.join(cwd, fileName)

		let source: string
		try {
			source = await fs.readFile(configPath, "utf8")
		} catch (error) {
			if (isMissingFileError(error)) {
				continue
			}
			throw error
		}

		if (fileName.endsWith(".json")) {
			return {
				config: JSON.parse(source) as PackageWizardConfigOpts,
				path: configPath
			}
		}

		return { config: await readConfigModule(configPath), path: configPath }
	}

	return null
}
