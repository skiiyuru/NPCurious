/**
 * Read newline-delimited lines from a stream, invoking `onLine` per non-empty trimmed line.
 * @param {NodeJS.ReadableStream} stream
 * @param {(line: string) => void} onLine
 * @returns {void}
 */
export function readLines(stream, onLine) {
  stream.setEncoding?.("utf8")
  let buffer = ""
  stream.on("data", (/** @type {string} */ chunk) => {
    buffer += chunk
    let newlineIndex = buffer.indexOf("\n")
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      if (line) onLine(line)
      newlineIndex = buffer.indexOf("\n")
    }
  })
}
