export const logTiming = (operation: string, startedAt: number): void => {
  if (process.env.RENOVATE_AUTO_UPDATE_TIMINGS !== "1") {
    return
  }

  process.stderr.write(
    `[timing] ${operation}: ${(performance.now() - startedAt).toFixed(1)}ms\n`
  )
}
