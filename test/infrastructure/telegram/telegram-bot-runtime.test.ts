import { describe, expect, it } from "vitest";

import {
  TelegramBotRuntime,
  telegramBotCommandMenu
} from "../../../src/infrastructure/providers/telegram/telegram-bot-runtime.js";
import { TelegramApiError } from "../../../src/infrastructure/providers/telegram/telegram-api.js";
import type {
  TelegramBotCommand,
  TelegramUpdate
} from "../../../src/infrastructure/providers/telegram/telegram-api.js";
import type { DozerClawApp } from "../../../src/composition/app.js";
import type { OutboundReply } from "../../../src/core/domain/messaging/reply.js";
import { HandleNormalizedInboundMessageUseCase } from "../../../src/application/use-cases/messaging/handle-normalized-inbound-message.js";

describe("TelegramBotRuntime", () => {
  it("registers the Telegram command menu before polling", async () => {
    const calls: string[] = [];
    const telegram = new FakeTelegramApi([]);
    telegram.onSetMyCommands = () => calls.push("setMyCommands");
    telegram.onGetUpdates = () => {
      calls.push("getUpdates");
      runtime.stop();
    };
    const runtime = new TelegramBotRuntime({
      app: new FakeApp({
        chatId: "internal-chat",
        text: "ok"
      }),
      telegram
    });

    await runtime.start();

    expect(calls).toEqual(["setMyCommands", "getUpdates"]);
    expect(telegram.commandMenus).toEqual([telegramBotCommandMenu]);
  });

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
        },
        async deleteMessage() {
          throw new Error("should not delete");
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

  it("retries the same update after message handling fails", async () => {
    const app = new FakeApp(
      { chatId: "internal-chat", text: "ok" },
      1
    );
    const telegram = new FakeTelegramApi([
      {
        update_id: 10,
        message: {
          message_id: 20,
          date: 1783152000,
          chat: { id: 300, type: "private" },
          from: { id: 400, first_name: "Alex" },
          text: "remember this"
        }
      }
    ]);
    const runtime = new TelegramBotRuntime({ app, telegram });

    await expect(runtime.pollOnce()).rejects.toThrow("message failed");
    await expect(runtime.pollOnce()).resolves.toBeUndefined();

    expect(telegram.getUpdatesInputs).toEqual([
      { timeoutSeconds: 30 },
      { timeoutSeconds: 30 }
    ]);
    expect(app.messageInputs).toHaveLength(2);
  });

  it("reuses a stored reply when Telegram sending fails after processing", async () => {
    let pipelineCalls = 0;
    let dispatcherCalls = 0;
    let storedReply: OutboundReply | undefined;
    const handler = new HandleNormalizedInboundMessageUseCase({
      pipeline: {
        async execute(input) {
          pipelineCalls += 1;

          return {
            status: "accepted" as const,
            context: {
              actor: {
                id: "actor-owner",
                displayName: "Owner",
                role: "owner" as const,
                status: "active" as const
              },
              chat: {
                id: "internal-chat",
                kind: "owner_private" as const,
                approved: true
              },
              action: input.action,
              provider: input.provider,
              receivedAt: input.receivedAt,
              text: input.text,
              attachments: input.attachments
            }
          };
        }
      },
      dispatcher: {
        async execute() {
          dispatcherCalls += 1;
          return { chatId: "internal-chat", text: "saved once" };
        }
      },
      receipts: {
        async find() {
          return storedReply;
        },
        async save(input) {
          storedReply = input.reply;
        }
      }
    });
    const app: DozerClawApp = {
      async getStartupDiagnostics() {
        return [];
      },
      async bootstrapOwnerIdentity() {
        throw new Error("should not bootstrap");
      },
      handleNormalizedInboundMessage: (input) => handler.execute(input)
    };
    const telegram = new FakeTelegramApi(
      [
        {
          update_id: 10,
          message: {
            message_id: 20,
            date: 1783152000,
            chat: { id: 300, type: "private" },
            from: { id: 400, first_name: "Alex" },
            text: "remember this"
          }
        }
      ],
      1
    );
    const runtime = new TelegramBotRuntime({ app, telegram });

    await expect(runtime.pollOnce()).rejects.toThrow("send failed");
    await expect(runtime.pollOnce()).resolves.toBeUndefined();

    expect(pipelineCalls).toBe(1);
    expect(dispatcherCalls).toBe(1);
    expect(telegram.sentMessages).toEqual([
      { chatId: "300", text: "saved once" }
    ]);
  });

  it("deletes an admin secret message before processing it", async () => {
    const app = new FakeApp({ chatId: "internal-chat", text: "Admin active" });
    const telegram = new FakeTelegramApi([
      {
        update_id: 10,
        message: {
          message_id: 20,
          date: 1783152000,
          chat: { id: 300, type: "private" },
          from: { id: 400, first_name: "Alex" },
          text: "/admin top-secret"
        }
      }
    ]);
    const runtime = new TelegramBotRuntime({ app, telegram });

    await runtime.pollOnce();

    expect(telegram.deletedMessages).toEqual([
      { chatId: "300", messageId: 20 }
    ]);
    expect(app.messageInputs).toHaveLength(1);
    expect(telegram.sentMessages).toEqual([
      { chatId: "300", text: "Admin active" }
    ]);
  });

  it("reports admin secret deletion failures without suppressing the reply", async () => {
    const errors: unknown[] = [];
    const app = new FakeApp({ chatId: "internal-chat", text: "Admin active" });
    const telegram = new FakeTelegramApi(
      [
        {
          update_id: 10,
          message: {
            message_id: 20,
            date: 1783152000,
            chat: { id: 300, type: "private" },
            from: { id: 400, first_name: "Alex" },
            text: "admin top-secret"
          }
        }
      ],
      0,
      1
    );
    const runtime = new TelegramBotRuntime({
      app,
      telegram,
      onError: (error) => errors.push(error)
    });

    await runtime.pollOnce();

    expect(errors).toEqual([expect.objectContaining({ message: "delete failed" })]);
    expect(telegram.sentMessages).toEqual([
      { chatId: "300", text: "Admin active" }
    ]);
  });
});

class FakeApp implements DozerClawApp {
  readonly bootstrapInputs: Parameters<DozerClawApp["bootstrapOwnerIdentity"]>[0][] =
    [];
  readonly messageInputs: Parameters<DozerClawApp["handleNormalizedInboundMessage"]>[0][] =
    [];

  constructor(
    private readonly reply: OutboundReply,
    private remainingMessageFailures = 0
  ) {}

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

    if (this.remainingMessageFailures > 0) {
      this.remainingMessageFailures -= 1;
      throw new Error("message failed");
    }

    return this.reply;
  }
}

class FakeTelegramApi {
  readonly sentMessages: { chatId: string; text: string }[] = [];
  readonly deletedMessages: { chatId: string; messageId: number }[] = [];
  readonly getUpdatesInputs: unknown[] = [];
  readonly commandMenus: Array<readonly TelegramBotCommand[]> = [];
  onSetMyCommands?: () => void;
  onGetUpdates?: () => void;

  constructor(
    private readonly updates: readonly TelegramUpdate[],
    private remainingSendFailures = 0,
    private remainingDeleteFailures = 0
  ) {}

  async getUpdates(input?: unknown) {
    this.onGetUpdates?.();
    this.getUpdatesInputs.push(input);
    return this.updates;
  }

  async setMyCommands(commands: readonly TelegramBotCommand[]) {
    this.onSetMyCommands?.();
    this.commandMenus.push(commands);
  }

  async sendMessage(chatId: string, text: string) {
    if (this.remainingSendFailures > 0) {
      this.remainingSendFailures -= 1;
      throw new Error("send failed");
    }

    this.sentMessages.push({ chatId, text });
  }

  async deleteMessage(chatId: string, messageId: number) {
    if (this.remainingDeleteFailures > 0) {
      this.remainingDeleteFailures -= 1;
      throw new Error("delete failed");
    }

    this.deletedMessages.push({ chatId, messageId });
  }
}
