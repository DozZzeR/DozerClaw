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
      text: "Отметил покупку купленной: два листа фанеры"
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
      text: "Убрал покупку в архив: шурупы"
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
      text: "Отметил покупку купленной: шурупы"
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
        "Нашел несколько подходящих покупок. Выбери номер:",
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
      text: "Отметил покупку купленной: шурупы 50 мм"
    });
    expect(repository.saved).toEqual([
      expect.objectContaining({
        id: "shopping-2",
        status: "bought"
      })
    ]);
  });

  it("uses semantic shopping references when lifecycle query tokens miss", async () => {
    const semanticMemory = new FakeMemory([
      {
        entry: {
          id: "drawer-shopping-1",
          body: [
            "Shopping item for home repair: impact driver bits",
            "",
            "References:",
            "- shopping_item:shopping-1"
          ].join("\n")
        },
        score: 0.9
      }
    ]);
    const repository = new FakeShoppingRepository([
      shoppingItem({
        id: "shopping-1",
        title: "биты для шуруповерта",
        projectTag: "ремонт",
        tags: ["инструменты"]
      })
    ]);
    const useCase = new ManageShoppingItemUseCase({
      repository,
      semanticMemory,
      recentLimit: 20,
      semanticLimit: 5,
      now: () => new Date("2026-08-04T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        action: "mark_bought",
        query: "купил насадки для дрели"
      })
    ).resolves.toEqual({
      status: "updated",
      item: {
        ...shoppingItem({
          id: "shopping-1",
          title: "биты для шуруповерта",
          projectTag: "ремонт",
          tags: ["инструменты"]
        }),
        status: "bought",
        updatedAt: new Date("2026-08-04T10:00:00.000Z")
      },
      text: "Отметил покупку купленной: биты для шуруповерта"
    });
    expect(semanticMemory.searches).toEqual([
      {
        text: "купил насадки для дрели",
        limit: 5
      }
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

class FakeMemory {
  readonly searches: { readonly text: string; readonly limit: number }[] = [];

  constructor(
    private readonly results: readonly {
      readonly entry: { readonly id: string; readonly body: string };
      readonly score?: number;
    }[]
  ) {}

  async store() {
    return {
      id: "drawer-unused",
      body: "unused"
    };
  }

  async search(input: { readonly text: string; readonly limit: number }) {
    this.searches.push(input);

    return this.results;
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
