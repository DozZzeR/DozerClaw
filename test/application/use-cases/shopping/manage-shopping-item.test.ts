import { describe, expect, it } from "vitest";

import { ManageShoppingItemUseCase } from "../../../../src/application/use-cases/shopping/manage-shopping-item.js";
import type { ShoppingItem } from "../../../../src/core/domain/shopping/shopping-item.js";

describe("ManageShoppingItemUseCase", () => {
  it("marks one matching open shopping item as bought", async () => {
    const repository = new FakeShoppingRepository([
      shoppingItem({ id: "shopping-1", title: "два листа фанеры" }),
      shoppingItem({ id: "shopping-2", title: "шурупы" })
    ]);
    const useCase = new ManageShoppingItemUseCase({
      repository,
      recentLimit: 20,
      now: () => new Date("2026-08-04T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        action: "mark_bought",
        query: "фанера"
      })
    ).resolves.toEqual({
      status: "updated",
      item: {
        ...shoppingItem({ id: "shopping-1", title: "два листа фанеры" }),
        status: "bought",
        updatedAt: new Date("2026-08-04T10:00:00.000Z")
      },
      text: "Marked shopping item as bought: два листа фанеры"
    });
    expect(repository.saved).toEqual([
      expect.objectContaining({
        id: "shopping-1",
        status: "bought",
        updatedAt: new Date("2026-08-04T10:00:00.000Z")
      })
    ]);
  });

  it("archives one matching open shopping item", async () => {
    const repository = new FakeShoppingRepository([
      shoppingItem({ id: "shopping-1", title: "шурупы" })
    ]);
    const useCase = new ManageShoppingItemUseCase({
      repository,
      recentLimit: 20,
      now: () => new Date("2026-08-04T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        action: "archive",
        query: "шурупы"
      })
    ).resolves.toEqual({
      status: "updated",
      item: {
        ...shoppingItem({ id: "shopping-1", title: "шурупы" }),
        status: "archived",
        updatedAt: new Date("2026-08-04T10:00:00.000Z")
      },
      text: "Archived shopping item: шурупы"
    });
  });

  it("matches Russian genitive item forms", async () => {
    const repository = new FakeShoppingRepository([
      shoppingItem({ id: "shopping-1", title: "шурупы" })
    ]);
    const useCase = new ManageShoppingItemUseCase({
      repository,
      recentLimit: 20,
      now: () => new Date("2026-08-04T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        action: "mark_bought",
        query: "купил шурупов"
      })
    ).resolves.toEqual({
      status: "updated",
      item: {
        ...shoppingItem({ id: "shopping-1", title: "шурупы" }),
        status: "bought",
        updatedAt: new Date("2026-08-04T10:00:00.000Z")
      },
      text: "Marked shopping item as bought: шурупы"
    });
  });

  it("does not mutate ambiguous matches", async () => {
    const repository = new FakeShoppingRepository([
      shoppingItem({ id: "shopping-1", title: "шурупы 30 мм" }),
      shoppingItem({ id: "shopping-2", title: "шурупы 50 мм" })
    ]);
    const useCase = new ManageShoppingItemUseCase({
      repository,
      recentLimit: 20,
      now: () => new Date("2026-08-04T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        action: "mark_bought",
        query: "шурупы"
      })
    ).resolves.toEqual({
      status: "ambiguous",
      items: [
        shoppingItem({ id: "shopping-1", title: "шурупы 30 мм" }),
        shoppingItem({ id: "shopping-2", title: "шурупы 50 мм" })
      ],
      text: [
        "More than one open shopping item matched. Please be more specific:",
        "1. шурупы 30 мм",
        "2. шурупы 50 мм"
      ].join("\n")
    });
    expect(repository.saved).toEqual([]);
  });

  it("updates an exact open shopping item by id", async () => {
    const repository = new FakeShoppingRepository([
      shoppingItem({ id: "shopping-1", title: "шурупы 30 мм" }),
      shoppingItem({ id: "shopping-2", title: "шурупы 50 мм" })
    ]);
    const useCase = new ManageShoppingItemUseCase({
      repository,
      recentLimit: 20,
      now: () => new Date("2026-08-04T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        action: "mark_bought",
        query: "шурупы",
        shoppingItemId: "shopping-2"
      })
    ).resolves.toEqual({
      status: "updated",
      item: {
        ...shoppingItem({ id: "shopping-2", title: "шурупы 50 мм" }),
        status: "bought",
        updatedAt: new Date("2026-08-04T10:00:00.000Z")
      },
      text: "Marked shopping item as bought: шурупы 50 мм"
    });
    expect(repository.saved).toEqual([
      expect.objectContaining({
        id: "shopping-2",
        status: "bought"
      })
    ]);
  });
});

class FakeShoppingRepository {
  readonly saved: ShoppingItem[] = [];

  constructor(private readonly items: readonly ShoppingItem[]) {}

  async saveShoppingItem(item: ShoppingItem) {
    this.saved.push(item);
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
