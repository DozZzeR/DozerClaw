import { describe, expect, it } from "vitest";

import { redactSensitive } from "../../../src/entrypoints/telegram/run-telegram-bot.js";

describe("redactSensitive", () => {
  it("masks Telegram bot tokens", () => {
    const text =
      "https://api.telegram.org/bot123456789:AAF-abcDEFghiJKLmnoPQRstuVWXyz012345/getMe";

    const result = redactSensitive(text);

    expect(result).not.toContain("AAF-abcDEFghiJKLmnoPQRstuVWXyz012345");
    expect(result).toContain("[redacted-telegram-token]");
  });

  it("masks bearer tokens", () => {
    expect(redactSensitive("Authorization: Bearer ya29.SECRETvalue-123")).toBe(
      "Authorization: Bearer [redacted]"
    );
  });

  it("masks token and key query parameters", () => {
    const text = "GET /files?access_token=abc123&key=zzz&name=photo.jpg";

    const result = redactSensitive(text);

    expect(result).toContain("access_token=[redacted]");
    expect(result).toContain("key=[redacted]");
    expect(result).toContain("name=photo.jpg");
  });

  it("leaves non-sensitive text untouched", () => {
    expect(redactSensitive("Telegram getUpdates failed: HTTP 502")).toBe(
      "Telegram getUpdates failed: HTTP 502"
    );
  });
});
