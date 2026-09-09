import { jest } from "@jest/globals"

const createSpinner = () => ({
  start: jest.fn(),
  stop: jest.fn(),
  cancel: jest.fn(),
  error: jest.fn(),
  message: jest.fn(),
  clear: jest.fn(),
  isCancelled: false
})

export const spinner = jest.fn(createSpinner)
export const select = jest.fn()
export const text = jest.fn()
export const cancel = jest.fn()
export const intro = jest.fn()
export const outro = jest.fn()
export const isCancel = jest.fn(() => false)
