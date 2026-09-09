import { defineConfig } from "tsdown"

export default defineConfig({
  entry: {
    index: "src/index.ts",
    runner: "src/cli-runner.ts"
  },
  outDir: "dist",
  format: ["esm", "cjs"],
  clean: true,
  minify: false,
  dts: true,
  banner: {
    js: "#!/usr/bin/env node"
  },
  sourcemap: true,
  deps: {
    neverBundle: true
  },
  target: "node22"
})
