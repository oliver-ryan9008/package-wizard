import chalk from "chalk"
import { ColorMode, ComplexLoggerOptions } from "../types"

export const chalkErrorStyle = chalk.bold.redBright
export const chalkSuccessStyle = chalk.bold.greenBright
export const chalkInfoStyle = chalk.bold.cyan
export const chalkWarnStyle = chalk.bold.yellowBright
export const chalkGeneralStyle = chalk.reset

const detectedColorLevel = chalk.level

const getTerminalWidth = (stream: NodeJS.WriteStream): number | null => {
  if (!stream.isTTY || typeof stream.columns !== "number") return null
  return Math.max(20, stream.columns)
}

const wrapWords = (content: string, width: number): string[] => {
  if (content.length <= width) return [content]

  const words = content.split(/\s+/).filter(Boolean)
  const wrapped: string[] = []
  let current = ""

  for (const word of words) {
    if (word.length > width) {
      if (current) {
        wrapped.push(current)
        current = ""
      }

      for (let index = 0; index < word.length; index += width) {
        wrapped.push(word.slice(index, index + width))
      }
      continue
    }

    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > width) {
      wrapped.push(current)
      current = word
    } else {
      current = candidate
    }
  }

  if (current) wrapped.push(current)
  return wrapped
}

const wrapLine = (line: string, width: number): string[] => {
  const indentation = line.match(/^\s*/)?.[0] ?? ""
  const content = line.slice(indentation.length)
  const contentWidth = Math.max(1, width - indentation.length)

  return wrapWords(content, contentWidth).map(part => `${indentation}${part}`)
}

export const wrapTerminalText = (
  message: string,
  stream: NodeJS.WriteStream
): string => {
  const width = getTerminalWidth(stream)
  if (!width) return message

  return message
    .split("\n")
    .flatMap(line => wrapLine(line, width))
    .join("\n")
}

export interface ColumnRow {
  label: string
  description: string
}

export const formatColumns = (
  rows: readonly ColumnRow[],
  options: {
    stream?: NodeJS.WriteStream
    indent?: string
    gap?: string
  } = {}
): string => {
  const stream = options.stream ?? process.stdout
  const width = getTerminalWidth(stream) ?? 100
  const indent = options.indent ?? "  "
  const gap = options.gap ?? "  "
  const longestLabel = Math.max(...rows.map(row => row.label.length), 0)
  const labelWidth = Math.min(longestLabel, Math.floor(width * 0.42))
  const descriptionWidth = width - indent.length - labelWidth - gap.length
  const continuationIndent = " ".repeat(indent.length + labelWidth + gap.length)

  return rows
    .flatMap(row => {
      if (descriptionWidth < 24 || row.label.length > labelWidth) {
        const detailIndent = `${indent}  `
        const details = wrapWords(
          row.description,
          Math.max(1, width - detailIndent.length)
        )
        return [
          `${indent}${row.label}`,
          ...details.map(detail => `${detailIndent}${detail}`)
        ]
      }

      const details = wrapWords(row.description, descriptionWidth)
      return details.map((detail, index) =>
        index === 0
          ? `${indent}${row.label.padEnd(labelWidth)}${gap}${detail}`
          : `${continuationIndent}${detail}`
      )
    })
    .join("\n")
}

export const setColorMode = (mode: ColorMode): void => {
  if (mode === ColorMode.Always) {
    chalk.level = 3
    return
  }

  if (mode === ColorMode.Never || process.env.NO_COLOR !== undefined) {
    chalk.level = 0
    return
  }

  chalk.level = detectedColorLevel
}

const write = (
  stream: NodeJS.WriteStream,
  message: string,
  style: (value: string) => string
): void => {
  stream.write(style(wrapTerminalText(message, stream)))
}

const writeLine = (
  stream: NodeJS.WriteStream,
  message: string,
  style: (value: string) => string
): void => {
  write(stream, `${message}\n`, style)
}

export const successBanner = (message?: string) => {
  write(
    process.stdout,
    `\n[OK] ${message ?? "Operation complete."}\n`,
    chalkSuccessStyle
  )
}

export const errorBanner = (message?: string) => {
  write(
    process.stderr,
    `\n[ERROR] ${message ?? "Operation failed. See above."}\n`,
    chalkErrorStyle
  )
}

export const errorLogger = (message: Error | string) => {
  writeLine(process.stderr, String(message), chalkErrorStyle)
}

export const successLogger = (message: string) => {
  writeLine(process.stdout, message, chalkSuccessStyle)
}

export const infoLogger = (message: string) => {
  writeLine(process.stdout, message, chalkInfoStyle)
}

export const warnLogger = (message: string) => {
  writeLine(process.stderr, message, chalkWarnStyle)
}

export const generalLogger = (message: string) => {
  writeLine(process.stdout, message, chalkGeneralStyle)
}

export const complexLogger = ({
  prefix = "",
  message = "",
  suffix = "",
  prefixColor = chalkGeneralStyle,
  messageColor = chalkInfoStyle.underline,
  suffixColor = chalkGeneralStyle
}: ComplexLoggerOptions) => {
  const formattedPrefix = prefixColor(prefix)
  const formattedMessage = messageColor(message)
  const formattedSuffix = suffixColor(suffix)

  process.stdout.write(
    `${formattedPrefix} ${formattedMessage} ${formattedSuffix}\n`
  )
}

export const logObj = (obj: object, pretty = false) => {
  process.stdout.write(`${JSON.stringify(obj, null, pretty ? 2 : undefined)}\n`)
}

export const stdErrSuccess = (message: string) => {
  write(process.stderr, message, chalkSuccessStyle)
}

export const stdErrError = (message: string) => {
  write(process.stderr, message, chalkErrorStyle)
}

export const stdErrInfo = (message: string) => {
  write(process.stderr, message, chalkInfoStyle)
}

export const stdErrWarn = (message: string) => {
  write(process.stderr, message, chalkWarnStyle)
}

export const stdErrGeneral = (message: string) => {
  write(process.stderr, message, chalkGeneralStyle)
}
