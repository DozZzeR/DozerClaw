import { describe, expect, it } from "vitest";

import { HandleNormalizedInboundMessageUseCase } from "../../../../src/application/use-cases/messaging/handle-normalized-inbound-message.js";
import type {
  AcceptedMessageContext,
  ProcessInboundMessageInput,
  ProcessInboundMessageResult
} from "../../../../src/application/use-cases/messaging/process-inbound-message.js";
import type { DispatchAcceptedCommandInput } from "../../../../src/application/use-cases/messaging/dispatch-accepted-command.js";

describe("HandleNormalizedInboundMessageUseCase", () => {
  it("routes, gates, and dispatches accepted messages", async () => {
    const pipeline = new FakePipeline({
      status: "accepted",
      context: acceptedContext
    });
    const dispatcher = new FakeDispatcher();
    const useCase = new HandleNormalizedInboundMessageUseCase({
      pipeline,
      dispatcher
    });

    await expect(useCase.execute(baseInput({ text: "  health  " }))).resolves.toEqual({
      chatId: "chat-owner",
      text: "dispatched system_health"
    });
    expect(pipeline.seenInput?.action).toBe("owner_read");
    expect(pipeline.seenInput?.text).toBe("health");
    expect(dispatcher.seenInput?.route.kind).toBe("system_health");
  });

  it("returns pending reply without dispatching", async () => {
    const pipeline = new FakePipeline({
      status: "pending_approval",
      reply: {
        chatId: "chat-pending",
        text: "pending"
      }
    });
    const dispatcher = new FakeDispatcher();
    const useCase = new HandleNormalizedInboundMessageUseCase({
      pipeline,
      dispatcher
    });

    await expect(useCase.execute(baseInput())).resolves.toEqual({
      chatId: "chat-pending",
      text: "pending"
    });
    expect(dispatcher.seenInput).toBeUndefined();
  });

  it("returns denied reply without dispatching", async () => {
    const pipeline = new FakePipeline({
      status: "denied",
      reason: "owner_required",
      reply: {
        chatId: "chat-family",
        text: "denied"
      }
    });
    const dispatcher = new FakeDispatcher();
    const useCase = new HandleNormalizedInboundMessageUseCase({
      pipeline,
      dispatcher
    });

    await expect(useCase.execute(baseInput())).resolves.toEqual({
      chatId: "chat-family",
      text: "denied"
    });
    expect(dispatcher.seenInput).toBeUndefined();
  });

  it("returns a stored receipt without repeating message processing", async () => {
    const pipeline = new FakePipeline({
      status: "accepted",
      context: acceptedContext
    });
    const dispatcher = new FakeDispatcher();
    const receipts = new FakeMessageReceiptRepository();
    const useCase = new HandleNormalizedInboundMessageUseCase({
      pipeline,
      dispatcher,
      receipts
    });
    const input = baseInput();

    const first = await useCase.execute(input);
    const second = await useCase.execute(input);

    expect(second).toEqual(first);
    expect(pipeline.callCount).toBe(1);
    expect(dispatcher.callCount).toBe(1);
    expect(receipts.savedKeys).toEqual([
      {
        provider: "telegram",
        providerChatId: "tg-chat-1",
        messageId: "message-1"
      }
    ]);
  });
});

const acceptedContext: AcceptedMessageContext = {
  actor: {
    id: "actor-owner",
    displayName: "Owner",
    role: "owner",
    status: "active"
  },
  chat: {
    id: "chat-owner",
    kind: "owner_private",
    approved: true
  },
  action: "owner_read",
  provider: "telegram",
  receivedAt: new Date("2026-07-02T20:00:00.000Z"),
  text: "health",
  attachments: []
};

function baseInput(
  overrides: Partial<Parameters<HandleNormalizedInboundMessageUseCase["execute"]>[0]> = {}
): Parameters<HandleNormalizedInboundMessageUseCase["execute"]>[0] {
  return {
    messageId: "message-1",
    provider: "telegram",
    providerUserId: "tg-user-1",
    providerChatId: "tg-chat-1",
    chatKind: "owner_private",
    displayName: "Owner",
    text: "health",
    attachments: [],
    receivedAt: new Date("2026-07-02T20:00:00.000Z"),
    now: new Date("2026-07-02T20:00:00.000Z"),
    ...overrides
  };
}

class FakePipeline {
  seenInput: ProcessInboundMessageInput | undefined;
  callCount = 0;

  constructor(private readonly result: ProcessInboundMessageResult) {}

  async execute(input: ProcessInboundMessageInput): Promise<ProcessInboundMessageResult> {
    this.callCount += 1;
    this.seenInput = input;

    return this.result;
  }
}

class FakeDispatcher {
  seenInput: DispatchAcceptedCommandInput | undefined;
  callCount = 0;

  async execute(input: DispatchAcceptedCommandInput) {
    this.callCount += 1;
    this.seenInput = input;

    return {
      chatId: input.context.chat.id,
      text: `dispatched ${input.route.kind}`
    };
  }
}

class FakeMessageReceiptRepository {
  private reply: { readonly chatId: string; readonly text: string } | undefined;
  readonly savedKeys: {
    readonly provider: string;
    readonly providerChatId: string;
    readonly messageId: string;
  }[] = [];

  async find() {
    return this.reply;
  }

  async save(input: {
    readonly provider: string;
    readonly providerChatId: string;
    readonly messageId: string;
    readonly reply: { readonly chatId: string; readonly text: string };
  }) {
    this.savedKeys.push({
      provider: input.provider,
      providerChatId: input.providerChatId,
      messageId: input.messageId
    });
    this.reply = input.reply;
  }
}
