import { select } from "./clack-prompts"

export class SelectPrompt {
  constructor(private readonly options: unknown) {}

  prompt(): ReturnType<typeof select> {
    return select(this.options as never)
  }
}

export const wrapTextWithPrefix = () => ""
