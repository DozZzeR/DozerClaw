import { describe, expect, it } from "vitest";

import {
  TelegramApiError,
  TelegramBotApiClient
} from "../../../src/infrastructure/providers/telegram/telegram-api.js";

describe("TelegramBotApiClient", () => {
  it("classifies getUpdates 409 conflicts", async () => {
    const client = new TelegramBotApiClient({
      token: "bot-token",
      fetch: async () =>
        new Response(
          JSON.stringify({
            ok: false,
            description: "Conflict: terminated by other getUpdates request"
          }),
          { status: 409 }
        )
    });

    await expect(client.getUpdates()).rejects.toMatchObject({
      name: "TelegramApiError",
      method: "getUpdates",
      statusCode: 409,
      isConflict: true
    } satisfies Partial<TelegramApiError>);
  });
});
