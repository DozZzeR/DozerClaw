import type { ShoppingItem } from "../../../core/domain/shopping/shopping-item.js";
import type { MemoryPort } from "../../../ports/memory-port.js";
import type { ShoppingRepositoryPort } from "../../../ports/shopping-repository-port.js";
import { shoppingQueryTokens } from "./shopping-query.js";

export type ManageShoppingItemAction = "mark_bought" | "archive";

export interface ManageShoppingItemDependencies {
  readonly repository: ShoppingRepositoryPort;
  readonly semanticMemory?: MemoryPort;
  readonly recentLimit: number;
  readonly semanticLimit?: number;
  readonly now: () => Date;
}

export interface ManageShoppingItemInput {
  readonly action: ManageShoppingItemAction;
  readonly query: string;
  readonly shoppingItemId?: string;
}

export type ManageShoppingItemResult =
  | {
      readonly status: "updated";
      readonly item: ShoppingItem;
      readonly text: string;
    }
  | {
      readonly status: "not_found";
      readonly text: string;
    }
  | {
      readonly status: "ambiguous";
      readonly items: readonly ShoppingItem[];
      readonly text: string;
    };

export class ManageShoppingItemUseCase {
  constructor(private readonly dependencies: ManageShoppingItemDependencies) {}

  async execute(input: ManageShoppingItemInput): Promise<ManageShoppingItemResult> {
    const items = await this.dependencies.repository.listRecentOpenShoppingItems(
      this.dependencies.recentLimit
    );
    const matches = input.shoppingItemId
      ? items.filter((item) => item.id === input.shoppingItemId)
      : await this.matchShoppingItems(input.query, items);

    if (matches.length === 0) {
      return {
        status: "not_found",
        text: "Не нашел подходящую открытую покупку."
      };
    }

    if (matches.length > 1) {
      return {
        status: "ambiguous",
        items: matches,
        text: formatAmbiguousShoppingItems(matches)
      };
    }

    const item = matches[0];
    if (!item) {
      return {
        status: "not_found",
        text: "Не нашел подходящую открытую покупку."
      };
    }

    const updatedItem: ShoppingItem = {
      ...item,
      status: input.action === "archive" ? "archived" : "bought",
      updatedAt: this.dependencies.now()
    };
    await this.dependencies.repository.saveShoppingItem(updatedItem);

    return {
      status: "updated",
      item: updatedItem,
      text:
        input.action === "archive"
          ? `Убрал покупку в архив: ${updatedItem.title}`
          : `Отметил покупку купленной: ${updatedItem.title}`
    };
  }

  private async matchShoppingItems(
    query: string,
    items: readonly ShoppingItem[]
  ): Promise<readonly ShoppingItem[]> {
    const lexicalMatches = matchingShoppingItems(query, items);

    if (lexicalMatches.length === 1) {
      return lexicalMatches;
    }

    const semanticMatches = await this.searchSemanticShoppingItems(query, items);

    if (semanticMatches.length === 0) {
      return lexicalMatches;
    }

    if (lexicalMatches.length === 0) {
      return semanticMatches;
    }

    const lexicalIds = new Set(lexicalMatches.map((item) => item.id));
    const narrowedMatches = semanticMatches.filter((item) =>
      lexicalIds.has(item.id)
    );

    return narrowedMatches.length > 0 ? narrowedMatches : lexicalMatches;
  }

  private async searchSemanticShoppingItems(
    query: string,
    openItems: readonly ShoppingItem[]
  ): Promise<readonly ShoppingItem[]> {
    const text = query.trim();

    if (!text || !this.dependencies.semanticMemory) {
      return [];
    }

    try {
      const results = await this.dependencies.semanticMemory.search({
        text,
        limit: this.dependencies.semanticLimit ?? 5
      });
      const openItemsById = new Map(openItems.map((item) => [item.id, item]));
      const ids = unique(results.flatMap((result) =>
        extractShoppingItemReferenceIds(result.entry.body)
      ));

      return ids
        .map((id) => openItemsById.get(id))
        .filter((item): item is ShoppingItem => Boolean(item));
    } catch {
      return [];
    }
  }
}

function matchingShoppingItems(
  query: string,
  items: readonly ShoppingItem[]
): readonly ShoppingItem[] {
  const tokens = queryTokens(query);
  const ranked = items
    .map((item) => ({
      item,
      score: scoreShoppingItem(tokens, item)
    }))
    .filter((rankedItem) => rankedItem.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.item.createdAt.getTime() - left.item.createdAt.getTime()
    );
  const topScore = ranked[0]?.score ?? 0;

  return ranked
    .filter((rankedItem) => rankedItem.score === topScore)
    .map((rankedItem) => rankedItem.item);
}

function scoreShoppingItem(tokens: readonly string[], item: ShoppingItem): number {
  const searchableTokens = new Set(
    queryTokens(
      [
        item.title,
        item.storeHint ?? "",
        item.projectTag ?? "",
        item.tags.join(" "),
        item.sourceMessageText
      ].join(" ")
    )
  );

  return tokens.reduce(
    (score, token) => score + (searchableTokens.has(token) ? 1 : 0),
    0
  );
}

function queryTokens(query: string): readonly string[] {
  return shoppingQueryTokens(query, stopWords);
}

function formatAmbiguousShoppingItems(items: readonly ShoppingItem[]): string {
  return [
    "Нашел несколько подходящих покупок. Выбери номер:",
    ...items.map((item, index) => `${index + 1}. ${item.title}`)
  ].join("\n");
}

function extractShoppingItemReferenceIds(text: string): readonly string[] {
  return Array.from(
    text.matchAll(/\bshopping_item:([a-zA-Z0-9._:-]+)/g),
    (match) => match[1] ?? ""
  ).filter((value) => value.length > 0);
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}

const stopWords = new Set([
  "купил",
  "купила",
  "купили",
  "куплено",
  "done",
  "bought",
  "archive",
  "архив",
  "убери",
  "для",
  "на",
  "по"
]);
