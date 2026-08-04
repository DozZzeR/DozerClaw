import type { ShoppingItem } from "../../../core/domain/shopping/shopping-item.js";
import type { ShoppingRepositoryPort } from "../../../ports/shopping-repository-port.js";
import { normalizeShoppingStoreHint } from "./record-shopping-item.js";

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
        text: "I do not have any open shopping items yet."
      };
    }

    const rankedItems = rankShoppingItems(queryTokens(input.query), items);
    const matchingItems = rankedItems
      .filter((item) => item.score > 0)
      .map((item) => item.item)
      .slice(0, this.dependencies.resultLimit ?? 10);

    if (matchingItems.length === 0) {
      return {
        text: "No matching open shopping items found."
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
  const seen = new Set<string>();

  return normalizeQueryText(query)
    .split(/\s+/u)
    .map(normalizeToken)
    .filter((token) => token.length >= 3 && !stopWords.has(token))
    .filter((token) => {
      if (seen.has(token)) {
        return false;
      }

      seen.add(token);
      return true;
    });
}

function normalizeQueryText(text: string): string {
  const withStoreAliases = text
    .toLowerCase()
    .replace(/ё/gu, "е")
    .replace(/уради\s*сам|uradi\s*sam|uradisam/giu, " uradi_sam ");
  const maybeStore = normalizeShoppingStoreHint(withStoreAliases.trim());

  if (maybeStore === "uradi_sam") {
    return maybeStore;
  }

  return withStoreAliases.replace(/[^a-z0-9а-я_]+/giu, " ").trim();
}

function normalizeToken(token: string): string {
  if (/^[а-я]+$/iu.test(token) && token.length > 4 && token.endsWith("у")) {
    return token.slice(0, -1);
  }

  return token;
}

function formatShoppingItems(items: readonly ShoppingItem[]): string {
  return [
    "Open shopping items:",
    ...items.map((item) => `- ${item.title}${formatMetadata(item)}`)
  ].join("\n");
}

function formatMetadata(item: ShoppingItem): string {
  const metadata = [
    item.storeHint ? `store: ${item.storeHint}` : undefined,
    item.projectTag ? `project: ${item.projectTag}` : undefined,
    item.tags.length > 0 ? `tags: ${item.tags.join(", ")}` : undefined
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
