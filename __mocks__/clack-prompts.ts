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

export const spinner: jest.Mock = jest.fn(createSpinner)
export const select: jest.Mock = jest.fn()
export const text: jest.Mock = jest.fn()
export const cancel: jest.Mock = jest.fn()
export const intro: jest.Mock = jest.fn()
export const outro: jest.Mock = jest.fn()
export const isCancel: jest.Mock = jest.fn(() => false)
