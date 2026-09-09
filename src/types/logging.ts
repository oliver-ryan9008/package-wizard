import { Chalk } from "chalk"

export interface ComplexLoggerOptions {
  prefix?: string
  message?: string
  suffix?: string
  prefixColor?: Chalk
  messageColor?: Chalk
  suffixColor?: Chalk
}
