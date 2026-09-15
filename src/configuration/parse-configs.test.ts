import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { readPackageWizardConfigFile } from "./parse-configs"

describe("readPackageWizardConfigFile", () => {
  let cwd: string

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "package-wizard-config-"))
  })

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true })
  })

  it("prefers TypeScript over JavaScript modules and JSON", async () => {
    await fs.writeFile(
      path.join(cwd, "package.wizard.ts"),
      'export default { ignore: ["typescript"] }'
    )
    await fs.writeFile(
      path.join(cwd, "package.wizard.mjs"),
      'export default { ignore: ["module"] }'
    )
    await fs.writeFile(
      path.join(cwd, "package.wizard.json"),
      JSON.stringify({ ignore: ["json"] })
    )

    await expect(readPackageWizardConfigFile(cwd)).resolves.toMatchObject({
      config: { ignore: ["typescript"] },
      path: path.join(cwd, "package.wizard.ts")
    })
  })

  it("prefers JS over JSON", async () => {
    await fs.writeFile(
      path.join(cwd, "package.wizard.js"),
      'module.exports = { ignore: ["javascript"] }'
    )
    await fs.writeFile(
      path.join(cwd, "package.wizard.json"),
      JSON.stringify({ ignore: ["json"] })
    )

    await expect(readPackageWizardConfigFile(cwd)).resolves.toMatchObject({
      config: { ignore: ["javascript"] },
      path: path.join(cwd, "package.wizard.js")
    })
  })

  it("falls back to JSON when modules are absent", async () => {
    await fs.writeFile(
      path.join(cwd, "package.wizard.json"),
      JSON.stringify({ ignore: ["json"] })
    )

    await expect(readPackageWizardConfigFile(cwd)).resolves.toMatchObject({
      config: { ignore: ["json"] },
      path: path.join(cwd, "package.wizard.json")
    })
  })
})