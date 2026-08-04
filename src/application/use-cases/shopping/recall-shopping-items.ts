import type { ShoppingItem } from "../../../core/domain/shopping/shopping-item.js";
import type { ShoppingRepositoryPort } from "../../../ports/shopping-repository-port.js";
import { shoppingQueryTokens } from "./shopping-query.js";

export interface RecallShoppingItemsDependencies {
  readonly repository: ShoppingRepositoryPort;
  readonly recentLimit: number;
  readonly resultLimit?: number;
}

export interface RecallShoppingItemsInput {
  readonly query: string;
}

export interface RecallShoppingItemsResult {
  readonly text: string;
}

export class RecallShoppingItemsUseCase {
  constructor(private readonly dependencies: RecallShoppingItemsDependencies) {}

  async execute(input: RecallShoppingItemsInput): Promise<RecallShoppingItemsResult> {
    const items = await this.dependencies.repository.listRecentOpenShoppingItems(
      this.dependencies.recentLimit
    );

    if (items.length === 0) {
      return {
        text: "Открытых покупок пока нет."
      };
    }

    const rankedItems = rankShoppingItems(queryTokens(input.query), items);
    const matchingItems = rankedItems
      .filter((item) => item.score > 0)
      .map((item) => item.item)
      .slice(0, this.dependencies.resultLimit ?? 10);

    if (matchingItems.length === 0) {
      return {
        text: "Не нашел открытых покупок по запросу."
      };
    }

    return {
      text: formatShoppingItems(matchingItems)
    };
  }
}

interface RankedShoppingItem {
  readonly item: ShoppingItem;
  readonly score: number;
}

function rankShoppingItems(
  tokens: readonly string[],
  items: readonly ShoppingItem[]
): readonly RankedShoppingItem[] {
  return items
    .map((item) => ({
      item,
      score: scoreShoppingItem(tokens, item)
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.item.createdAt.getTime() - left.item.createdAt.getTime()
    );
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

function formatShoppingItems(items: readonly ShoppingItem[]): string {
  return [
    "Открытые покупки:",
    ...items.map((item) => `- ${item.title}${formatMetadata(item)}`)
  ].join("\n");
}

function formatMetadata(item: ShoppingItem): string {
  const metadata = [
    item.storeHint ? `магазин: ${item.storeHint}` : undefined,
    item.projectTag ? `проект: ${item.projectTag}` : undefined,
    item.tags.length > 0 ? `теги: ${item.tags.join(", ")}` : undefined
  ].filter((value): value is string => Boolean(value));

  return metadata.length > 0 ? ` (${metadata.join(", ")})` : "";
}

const stopWords = new Set([
  "what",
  "show",
  "list",
  "есть",
  "нас",
  "что",
  "или",
  "покажи",
  "список",
  "купить",
  "покупки"
]);
