import { describe, expect, it } from "vitest";

import { RecordShoppingItemUseCase } from "../../../../src/application/use-cases/shopping/record-shopping-item.js";
import type { ShoppingItem } from "../../../../src/core/domain/shopping/shopping-item.js";

describe("RecordShoppingItemUseCase", () => {
  it("stores an open shopping item and a best-effort semantic mirror", async () => {
    const repository = new FakeShoppingRepository();
    const semanticMemory = new FakeMemory();
    const useCase = new RecordShoppingItemUseCase({
      repository,
      semanticMemory,
      generateId: () => "shopping-1",
      now: () => new Date("2026-08-03T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        title: "два листа фанеры",
        storeHint: "уради сам",
        projectTag: "ремонт",
        tags: ["фанера", "ремонт"],
        sourceActorId: "actor-owner",
        sourceChatId: "chat-owner",
        sourceMessageText: "купить в уради сам два листа фанеры"
      })
    ).resolves.toEqual({
      status: "created",
      item: {
        id: "shopping-1",
        title: "два листа фанеры",
        storeHint: "uradi_sam",
        projectTag: "ремонт",
        tags: ["фанера", "ремонт"],
        semanticMemoryEntryId: "drawer-shopping-1",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-owner",
        sourceMessageText: "купить в уради сам два листа фанеры",
        status: "open",
        createdAt: new Date("2026-08-03T10:00:00.000Z"),
        updatedAt: new Date("2026-08-03T10:00:00.000Z")
      }
    });
    expect(repository.saved[0]).toEqual(
      expect.objectContaining({
        id: "shopping-1"
      })
    );
    expect(repository.saved[0]).not.toHaveProperty("semanticMemoryEntryId");
    expect(repository.saved[1]).toEqual(
      expect.objectContaining({
        id: "shopping-1",
        semanticMemoryEntryId: "drawer-shopping-1"
      })
    );
    expect(semanticMemory.stored).toEqual({
      body: "Shopping item for uradi_sam, project ремонт: два листа фанеры (tags: фанера, ремонт)",
      references: ["shopping_item:shopping-1"]
    });
  });
});

class FakeShoppingRepository {
  readonly saved: ShoppingItem[] = [];

  async saveShoppingItem(item: ShoppingItem) {
    this.saved.push(item);
  }

  async listRecentOpenShoppingItems() {
    return [];
  }
}

class FakeMemory {
  stored: { body: string; references: readonly string[] } | undefined;

  async store(input: { body: string; references: readonly string[] }) {
    this.stored = input;

    return {
      id: "drawer-shopping-1",
      body: input.body
    };
  }

  async search() {
    return [];
  }
}
