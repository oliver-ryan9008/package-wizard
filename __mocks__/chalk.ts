import { jest } from "@jest/globals"

interface ChalkState {
  level: number
}

const createStyle = (
  styles: string[] = [],
  state: ChalkState = { level: 0 }
): jest.Mock<(msg: unknown) => string> =>
  new Proxy(
    jest.fn((msg: unknown) => {
      const prefix =
        styles.length > 0 ? `[${styles.join(".").toUpperCase()}]` : ""

      return `${prefix}${String(msg)}`
    }),
    {
      get: (target, prop: string | symbol, receiver) => {
        if (prop === "level") {
          return state.level
        }

        if (typeof prop !== "string") {
          return Reflect.get(target, prop, receiver)
        }

        const existing = Reflect.get(target, prop, receiver)
        return existing === undefined
          ? createStyle([...styles, prop], state)
          : existing
      },
      set: (target, prop: string | symbol, value, receiver) => {
        if (prop === "level" && typeof value === "number") {
          state.level = value
          return true
        }

        return Reflect.set(target, prop, value, receiver)
      }
    }
  )

const chalk = createStyle()

export default chalk
