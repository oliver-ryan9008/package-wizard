import { type PackageWizardConfigOpts } from "./types"

/**
 * Defines a type-safe package-wizard configuration.
 *
 * Use this helper in `package.wizard.ts`, `package.wizard.mjs`, or
 * `package.wizard.js` to get editor completion and hover documentation for
 * configuration fields. The helper returns the configuration unchanged.
 *
 * Native package-wizard configuration files take precedence over fallback
 * configuration files such as `renovate.json`.
 *
 * @param config Configuration defaults, package policies, and ordered rules.
 * @returns The supplied configuration.
 *
 * @example
 * ```ts
 * import { definePackageWizardConfig } from "package-wizard"
 *
 * export default definePackageWizardConfig({
 *   defaults: {
 *     enabledUpdateTypes: ["patch", "minor"]
 *   },
 *   packages: {
 *     react: { disabledUpdateTypes: "minor" }
 *   }
 * })
 *
 * Use "all" in enabledUpdateTypes or disabledUpdateTypes to represent
 * patch, minor, and major together.
 * ```
 */
export const definePackageWizardConfig = (
	config: PackageWizardConfigOpts
): PackageWizardConfigOpts => config