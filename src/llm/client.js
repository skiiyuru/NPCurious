/**
 * Minimal LLM client for an OpenAI-compatible chat-completions endpoint.
 * Inject a `generate` fn for tests/offline use; otherwise uses HTTP with timeout.
 */
export class LLMClient {
  /**
   * @param {{
   *   baseURL?: string,
   *   apiKey?: string,
   *   model?: string,
   *   systemPrompt?: string,
   *   generate?: (prompt: string) => Promise<string>,
   *   timeoutMs?: number,
   *   logger?: import('../types.js').Logger
   * }} [options]
   */
  constructor({
    baseURL,
    apiKey,
    model = "gpt-4o-mini",
    systemPrompt = "",
    generate,
    timeoutMs = 8000,
    logger,
  } = {}) {
    this.baseURL = baseURL
    this.apiKey = apiKey
    this.model = model
    this.systemPrompt = systemPrompt
    this.timeoutMs = timeoutMs
    this._generate = generate
    this.logger = logger
  }

  /**
   * True when client can produce text (injected generator or configured URL).
   * @returns {boolean}
   */
  isAvailable() {
    return typeof this._generate === "function" || Boolean(this.baseURL)
  }

  /**
   * Generate a completion; logs raw response when logger is attached.
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async generate(prompt) {
    const text = await this._request(prompt)
    const shown =
      text.length > 800 ? `${text.slice(0, 800)}… (${text.length} chars)` : text
    if (this.logger?.log) {
      this.logger.log(
        "[llm] response:",
        shown.replace(/\s+/g, " ").trim() || "(empty)"
      )
    }
    return text
  }

  /**
   * Injected generator if present, otherwise live HTTP request with abort timeout.
   * @param {string} prompt
   * @returns {Promise<string>}
   */
  async _request(prompt) {
    if (typeof this._generate === "function") return this._generate(prompt)
    if (!this.baseURL)
      throw new Error("LLM client has no baseURL and no injected generate()")

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(
        `${this.baseURL.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: this.model,
            temperature: 0,
            messages: [
              ...(this.systemPrompt
                ? [{ role: "system", content: this.systemPrompt }]
                : []),
              { role: "user", content: prompt },
            ],
          }),
          signal: controller.signal,
        }
      )
      if (!response.ok) throw new Error(`LLM HTTP ${response.status}`)
      const data = await response.json()
      return data?.choices?.[0]?.message?.content ?? ""
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
