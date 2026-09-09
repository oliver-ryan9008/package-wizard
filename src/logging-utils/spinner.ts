import { spinner } from "@clack/prompts"

export interface TerminalSpinner {
  text: string
  succeed: (message: string) => void
  fail: (message: string) => void
}

export const startSpinner = (initialText: string): TerminalSpinner => {
  const progress = spinner({ indicator: "dots" })
  let text = initialText
  progress.start(text)

  return {
    get text() {
      return text
    },
    set text(nextText: string) {
      text = nextText
      progress.message(nextText)
    },
    succeed: message => {
      progress.stop(message)
    },
    fail: message => {
      progress.error(message)
    }
  }
}
