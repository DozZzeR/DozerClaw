import { describe, expect, it } from "vitest";

import { TelegramBotRuntime } from "../../../src/infrastructure/providers/telegram/telegram-bot-runtime.js";
import { TelegramApiError } from "../../../src/infrastructure/providers/telegram/telegram-api.js";
import type { TelegramUpdate } from "../../../src/infrastructure/providers/telegram/telegram-api.js";
import type { DozerClawApp } from "../../../src/composition/app.js";
import type { OutboundReply } from "../../../src/core/domain/messaging/reply.js";

describe("TelegramBotRuntime", () => {
  it("normalizes a private owner text update and sends the app reply", async () => {
    const app = new FakeApp({
      chatId: "internal-owner-chat",
      text: "System health:\nOK"
    });
    const telegram = new FakeTelegramApi([
      {
        update_id: 10,
        message: {
          message_id: 20,
          date: 1783152000,
          chat: {
            id: 300,
            type: "private"
          },
          from: {
            id: 400,
            first_name: "Alex"
          },
          text: "/health"
        }
      }
    ]);
    const runtime = new TelegramBotRuntime({
      app,
      telegram,
      ownerUserId: "400",
      now: () => new Date("2026-07-04T12:00:01.000Z")
    });

    await runtime.pollOnce();

    expect(app.bootstrapInputs).toEqual([
      {
        provider: "telegram",
        providerUserId: "400",
        providerChatId: "300",
        displayName: "Alex"
      }
    ]);
    expect(app.messageInputs).toEqual([
      expect.objectContaining({
        messageId: "20",
        provider: "telegram",
        providerUserId: "400",
        providerChatId: "300",
        chatKind: "owner_private",
        displayName: "Alex",
        text: "/health",
        attachments: [],
        receivedAt: new Date("2026-07-04T08:00:00.000Z"),
        now: new Date("2026-07-04T12:00:01.000Z")
      })
    ]);
    expect(telegram.sentMessages).toEqual([
      {
        chatId: "300",
        text: "System health:\nOK"
      }
    ]);
  });

  it("normalizes Telegram document attachments", async () => {
    const app = new FakeApp({
      chatId: "internal-family-chat",
      text: "Saved 1 attachment(s)."
    });
    const telegram = new FakeTelegramApi([
      {
        update_id: 11,
        message: {
          message_id: 21,
          date: 1783152000,
          chat: {
            id: -100,
            type: "group",
            title: "Family"
          },
          from: {
            id: 401,
            username: "family_member"
          },
          document: {
            file_id: "telegram-file-1",
            file_name: "doc.pdf",
            mime_type: "application/pdf",
            file_size: 1234
          },
          caption: "store this"
        }
      }
    ]);
    const runtime = new TelegramBotRuntime({
      app,
      telegram,
      ownerUserId: "400",
      now: () => new Date("2026-07-04T12:00:01.000Z")
    });

    await runtime.pollOnce();

    expect(app.bootstrapInputs).toEqual([]);
    expect(app.messageInputs[0]).toEqual(
      expect.objectContaining({
        providerUserId: "401",
        providerChatId: "-100",
        chatKind: "family_group",
        displayName: "family_member",
        text: "store this",
        attachments: [
          {
            id: "telegram-file-1",
            providerFileId: "telegram-file-1",
            fileName: "doc.pdf",
            mimeType: "application/pdf",
            sizeBytes: 1234
          }
        ]
      })
    );
  });

  it("backs off longer for Telegram getUpdates conflicts", async () => {
    const errors: unknown[] = [];
    const sleeps: number[] = [];
    const runtime = new TelegramBotRuntime({
      app: new FakeApp({
        chatId: "internal-chat",
        text: "ok"
      }),
      telegram: {
        async getUpdates() {
          throw new TelegramApiError({
            method: "getUpdates",
            statusCode: 409,
            description: "Conflict"
          });
        },
        async sendMessage() {
          throw new Error("should not send");
        }
      },
      onError(error) {
        errors.push(error);
        runtime.stop();
      },
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds);
      }
    });

    await runtime.start();

    expect(errors).toEqual([
      expect.objectContaining({
        statusCode: 409,
        isConflict: true
      })
    ]);
    expect(sleeps).toEqual([30000]);
  });
});

class FakeApp implements DozerClawApp {
  readonly bootstrapInputs: Parameters<DozerClawApp["bootstrapOwnerIdentity"]>[0][] =
    [];
  readonly messageInputs: Parameters<DozerClawApp["handleNormalizedInboundMessage"]>[0][] =
    [];

  constructor(private readonly reply: OutboundReply) {}

  async getStartupDiagnostics() {
    return [];
  }

  async bootstrapOwnerIdentity(
    input: Parameters<DozerClawApp["bootstrapOwnerIdentity"]>[0]
  ) {
    this.bootstrapInputs.push(input);

    return {
      actor: {
        id: "owner",
        displayName: input.displayName,
        role: "owner" as const,
        status: "active" as const
      },
      chat: {
        id: this.reply.chatId,
        kind: "owner_private" as const,
        approved: true
      },
      createdActor: true,
      createdIdentity: true,
      createdChat: true
    };
  }

  async handleNormalizedInboundMessage(
    input: Parameters<DozerClawApp["handleNormalizedInboundMessage"]>[0]
  ) {
    this.messageInputs.push(input);

    return this.reply;
  }
}

class FakeTelegramApi {
  readonly sentMessages: { chatId: string; text: string }[] = [];

  constructor(private readonly updates: readonly TelegramUpdate[]) {}

  async getUpdates() {
    return this.updates;
  }

  async sendMessage(chatId: string, text: string) {
    this.sentMessages.push({ chatId, text });
  }
}
