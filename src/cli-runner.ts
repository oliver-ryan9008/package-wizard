import { run } from "./cli"

if (process.env.NODE_ENV !== "test") {
  void Promise.resolve(run())
    .then(result => {
      if (result instanceof Error) {
        process.exitCode = 1
      } else if (
        result &&
        "hasMandatoryUpdates" in result &&
        result.hasMandatoryUpdates
      ) {
        process.exitCode = 2
      }
    })
    .catch(error => {
      process.stderr.write(
        `${JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          code: "CLI_ERROR"
        })}\n`
      )
      process.exitCode = 1
    })
}
