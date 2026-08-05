import { describe, expect, it } from "vitest";

import {
  DispatchShoppingRequestUseCase,
  parseShoppingCommandRail
} from "../../../../src/application/use-cases/shopping/dispatch-shopping-request.js";
import type { AcceptedMessageContext } from "../../../../src/application/use-cases/messaging/process-inbound-message.js";
import type { ShoppingItem } from "../../../../src/core/domain/shopping/shopping-item.js";

describe("DispatchShoppingRequestUseCase", () => {
  it("parses and records a /shop command rail without model routing", async () => {
    const shoppingRecorder = new FakeShoppingRecorder();
    const useCase = new DispatchShoppingRequestUseCase({
      shoppingRecorder
    });
    const rail = parseShoppingCommandRail(
      "/shop купить в уради сам два листа фанеры"
    );

    expect(rail).toEqual({
      action: "family_write",
      intent: {
        kind: "record_shopping_item",
        title: "два листа фанеры",
        storeHint: "uradi_sam",
        tags: []
      }
    });

    await expect(
      useCase.dispatchIntent(acceptedContext, rail!.intent)
    ).resolves.toEqual({
      chatId: "chat-owner",
      text: "Сохранил покупку: два листа фанеры"
    });
    expect(shoppingRecorder.seenInput).toEqual({
      title: "два листа фанеры",
      storeHint: "uradi_sam",
      tags: [],
      sourceActorId: "actor-owner",
      sourceChatId: "chat-owner",
      sourceMessageText: "/shop купить в уради сам два листа фанеры"
    });
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
  action: "family_read",
  provider: "telegram",
  receivedAt: new Date("2026-08-04T10:00:00.000Z"),
  text: "/shop купить в уради сам два листа фанеры",
  attachments: []
};

class FakeShoppingRecorder {
  seenInput:
    | {
        readonly title: string;
        readonly storeHint?: string;
        readonly projectTag?: string;
        readonly tags: readonly string[];
        readonly sourceActorId: string;
        readonly sourceChatId: string;
        readonly sourceMessageText: string;
      }
    | undefined;

  async execute(input: NonNullable<FakeShoppingRecorder["seenInput"]>) {
    this.seenInput = input;

    return {
      status: "created" as const,
      item: shoppingItem({
        id: "shopping-1",
        title: input.title
      })
    };
  }
}

function shoppingItem(input: Partial<ShoppingItem>): ShoppingItem {
  return {
    id: input.id ?? "shopping-1",
    title: input.title ?? "shopping item",
    tags: input.tags ?? [],
    sourceActorId: "actor-owner",
    sourceChatId: "chat-owner",
    sourceMessageText: input.sourceMessageText ?? "shopping item",
    status: input.status ?? "open",
    createdAt: new Date("2026-08-04T10:00:00.000Z"),
    updatedAt: new Date("2026-08-04T10:00:00.000Z")
  };
}
