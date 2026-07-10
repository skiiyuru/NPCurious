// Ambient type declaration for the untyped Deliveroo SDK.
//
// The package ships plain JavaScript with no type definitions. This declaration lets TypeScript
// resolve `import { DjsConnect } from '@unitn-asa/deliveroo-js-sdk'` without descending into (and
// reporting errors from) the library's own source. The runtime socket is intentionally `any`
// because its surface varies between lab versions; our code probes methods defensively.
declare module '@unitn-asa/deliveroo-js-sdk' {
  /**
   * Connect to a Deliveroo server and return a socket-like client.
   * @param host - Server address (e.g. "localhost:8080").
   * @param token - Authentication token for the agent.
   */
  export function DjsConnect(host?: string, token?: string): any
  const _default: any
  export default _default
}
