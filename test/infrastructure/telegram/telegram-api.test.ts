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

  it("passes AbortSignal to Telegram API requests when timeout is configured", async () => {
    const requests: RequestInit[] = [];
    const client = new TelegramBotApiClient({
      token: "bot-token",
      requestTimeoutMs: 1000,
      fetch: async (_input, init) => {
        requests.push(init ?? {});

        return new Response(JSON.stringify({ ok: true, result: [] }), {
          status: 200
        });
      }
    });

    await client.getUpdates();

    expect(requests[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects file downloads when content-length exceeds the byte cap", async () => {
    const client = new TelegramBotApiClient({
      token: "bot-token",
      fetch: async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: {
            "content-length": "3"
          }
        })
    });

    await expect(
      client.downloadFile("https://telegram/file", { maxBytes: 2 })
    ).rejects.toThrow("Telegram file download exceeds max size");
  });

  it("rejects file downloads when streamed bytes exceed the byte cap", async () => {
    const client = new TelegramBotApiClient({
      token: "bot-token",
      fetch: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array([1, 2]));
              controller.enqueue(new Uint8Array([3]));
              controller.close();
            }
          }),
          { status: 200 }
        )
    });

    await expect(
      client.downloadFile("https://telegram/file", { maxBytes: 2 })
    ).rejects.toThrow("Telegram file download exceeds max size");
  });
});
