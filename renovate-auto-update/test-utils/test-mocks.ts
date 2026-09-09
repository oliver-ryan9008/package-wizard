import { jest } from "@jest/globals"

export const mockSpinner = {
  text: "",
  start: jest.fn().mockReturnThis(),
  succeed: jest.fn(),
  fail: jest.fn(),
  stop: jest.fn()
}
