import { describe, expect, it } from "vitest";

import { buildApp } from "../../src/composition/build-app.js";

describe("buildApp", () => {
  it("composes the application and exposes startup diagnostics", async () => {
    const app = buildApp({
      env: {
        DOZERCLAW_DB_PATH: ":memory:",
        NODE_ENV: "test"
      }
    });

    await expect(app.getStartupDiagnostics()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "composition",
          status: "ok"
        }),
        expect.objectContaining({
          name: "state_repository",
          status: "ok"
        }),
        expect.objectContaining({
          name: "event_log",
          status: "ok"
        })
      ])
    );
  });

  it("bootstraps owner and handles normalized health message", async () => {
    const app = buildApp({
      env: {
        DOZERCLAW_DB_PATH: ":memory:",
        NODE_ENV: "test"
      }
    });
    const bootstrap = await app.bootstrapOwnerIdentity({
      provider: "telegram",
      providerUserId: "tg-owner",
      providerChatId: "tg-owner-chat",
      displayName: "Owner"
    });

    const reply = await app.handleNormalizedInboundMessage({
      messageId: "message-1",
      provider: "telegram",
      providerUserId: "tg-owner",
      providerChatId: "tg-owner-chat",
      chatKind: "owner_private",
      displayName: "Owner",
      text: "health",
      receivedAt: new Date("2026-07-03T05:00:00.000Z"),
      now: new Date("2026-07-03T05:00:00.000Z")
    });

    expect(reply.chatId).toBe(bootstrap.chat.id);
    expect(reply.text).toContain("System health:");
    expect(reply.text).toContain("Uptime:");
    expect(reply.text).toContain("Memory:");
  });
});
