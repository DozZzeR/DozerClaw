/**
 * Mask secret-like substrings before writing errors or short-term conversation
 * history: Telegram bot tokens, bearer tokens, and token/key query parameters.
 * Addresses DC-LOW-004.
 */
export function redactSensitive(text: string): string {
  return text
    .replace(/\d{6,12}:[A-Za-z0-9_-]{30,}/g, "[redacted-telegram-token]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(
      /([?&](?:access_token|refresh_token|token|api_key|apikey|key|secret)=)[^&\s]+/gi,
      "$1[redacted]"
    );
}
