import type { ShoppingItem } from "../../../core/domain/shopping/shopping-item.js";
import type { ShoppingRepositoryPort } from "../../../ports/shopping-repository-port.js";

export type ManageShoppingItemAction = "mark_bought" | "archive";

export interface ManageShoppingItemDependencies {
  readonly repository: ShoppingRepositoryPort;
  readonly recentLimit: number;
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
      : matchingShoppingItems(input.query, items);

    if (matches.length === 0) {
      return {
        status: "not_found",
        text: "No matching open shopping item found."
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
        text: "No matching open shopping item found."
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
          ? `Archived shopping item: ${updatedItem.title}`
          : `Marked shopping item as bought: ${updatedItem.title}`
    };
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
  const seen = new Set<string>();

  return query
    .toLowerCase()
    .replace(/ё/gu, "е")
    .replace(/уради\s*сам|uradi\s*sam|uradisam/giu, " uradi_sam ")
    .replace(/[^a-z0-9а-я_]+/giu, " ")
    .trim()
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

function normalizeToken(token: string): string {
  if (/^[а-я]+$/iu.test(token) && token.length > 4 && /[ауыеи]$/iu.test(token)) {
    return token.slice(0, -1);
  }

  return token;
}

function formatAmbiguousShoppingItems(items: readonly ShoppingItem[]): string {
  return [
    "More than one open shopping item matched. Please be more specific:",
    ...items.map((item, index) => `${index + 1}. ${item.title}`)
  ].join("\n");
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
  "убери"
]);
