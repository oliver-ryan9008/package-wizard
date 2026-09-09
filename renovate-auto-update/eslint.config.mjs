import js from "@eslint/js"
import tseslint from "typescript-eslint"
import jestPlugin from "eslint-plugin-jest"
import prettierPluginRecommended from "eslint-plugin-prettier/recommended"

const rules = {
  "@typescript-eslint/no-unused-vars": [
    "warn",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_"
    }
  ],
  "@typescript-eslint/no-explicit-any": "warn",
  "@typescript-eslint/ban-ts-comment": "warn"
}

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/coverage/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.spec.ts", "**/*.test.ts"],
    plugins: {
      jest: jestPlugin
    },
    languageOptions: {
      globals: jestPlugin.environments.globals.globals
    },
    rules: {
      ...jestPlugin.configs.recommended.rules,
      "jest/no-disabled-tests": "warn",
      "jest/no-focused-tests": "error"
    }
  },
  prettierPluginRecommended,
  { rules }
)
