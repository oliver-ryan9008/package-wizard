export const logTiming = (operation: string, startedAt: number): void => {
  if (process.env.PACKAGE_WIZARD_TIMINGS !== "1") {
    return
  }

  process.stderr.write(
    `[timing] ${operation}: ${(performance.now() - startedAt).toFixed(1)}ms\n`
  )
}
