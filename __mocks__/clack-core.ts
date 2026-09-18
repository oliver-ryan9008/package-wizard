import { select } from "./clack-prompts"
import { multiselect } from "./clack-prompts"

export class SelectPrompt {
  constructor(private readonly options: unknown) {}

  prompt(): ReturnType<typeof select> {
    return select(this.options as never)
  }
}

export class MultiSelectPrompt {
  options: unknown[]
  cursor = 0
  value: unknown[]
  state = "active"

  constructor(options: { options: unknown[]; initialValues?: unknown[] }) {
    this.options = options.options
    this.value = options.initialValues ?? []
  }

  on(): void {}

  prompt(): ReturnType<typeof multiselect> {
    return multiselect({ options: this.options, initialValues: this.value })
  }
}

export const wrapTextWithPrefix = () => ""
