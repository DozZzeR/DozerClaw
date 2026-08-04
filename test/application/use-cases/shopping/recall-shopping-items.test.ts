import { describe, expect, it } from "vitest";

import { RecallShoppingItemsUseCase } from "../../../../src/application/use-cases/shopping/recall-shopping-items.js";
import type { ShoppingItem } from "../../../../src/core/domain/shopping/shopping-item.js";

describe("RecallShoppingItemsUseCase", () => {
  it("returns open shopping items matching store and project tokens", async () => {
    const useCase = new RecallShoppingItemsUseCase({
      repository: new FakeShoppingRepository([
        shoppingItem({
          id: "shopping-1",
          title: "два листа фанеры",
          storeHint: "uradi_sam",
          projectTag: "ремонт",
          tags: ["фанера", "ремонт"]
        }),
        shoppingItem({
          id: "shopping-2",
          title: "шурупы",
          projectTag: "ремонт",
          tags: ["шурупы", "ремонт"]
        }),
        shoppingItem({
          id: "shopping-3",
          title: "молоко",
          storeHint: "idea",
          tags: ["еда"]
        })
      ]),
      recentLimit: 20,
      resultLimit: 10
    });

    await expect(
      useCase.execute({
        query: "что у нас есть по ремонту или урадисам"
      })
    ).resolves.toEqual({
      text: [
        "Открытые покупки:",
        "- два листа фанеры (магазин: uradi_sam, проект: ремонт, теги: фанера, ремонт)",
        "- шурупы (проект: ремонт, теги: шурупы, ремонт)"
      ].join("\n")
    });
  });

  it("matches Russian genitive item forms in recall queries", async () => {
    const useCase = new RecallShoppingItemsUseCase({
      repository: new FakeShoppingRepository([
        shoppingItem({
          id: "shopping-1",
          title: "шурупы",
          projectTag: "ремонт",
          tags: ["шурупы"]
        })
      ]),
      recentLimit: 20,
      resultLimit: 10
    });

    await expect(
      useCase.execute({
        query: "что есть по шурупов для ремонта"
      })
    ).resolves.toEqual({
      text: [
        "Открытые покупки:",
        "- шурупы (проект: ремонт, теги: шурупы)"
      ].join("\n")
    });
  });
});

class FakeShoppingRepository {
  constructor(private readonly items: readonly ShoppingItem[]) {}

  async saveShoppingItem() {
    return undefined;
  }

  async listRecentOpenShoppingItems() {
    return this.items;
  }
}

function shoppingItem(input: Partial<ShoppingItem>): ShoppingItem {
  return {
    id: input.id ?? "shopping-1",
    title: input.title ?? "item",
    ...(input.storeHint ? { storeHint: input.storeHint } : {}),
    ...(input.projectTag ? { projectTag: input.projectTag } : {}),
    tags: input.tags ?? [],
    sourceActorId: "actor-owner",
    sourceChatId: "chat-owner",
    sourceMessageText: input.sourceMessageText ?? "source",
    status: input.status ?? "open",
    createdAt: input.createdAt ?? new Date("2026-08-03T10:00:00.000Z"),
    updatedAt: input.updatedAt ?? new Date("2026-08-03T10:00:00.000Z")
  };
}
