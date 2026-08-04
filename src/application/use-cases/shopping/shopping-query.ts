import { normalizeShoppingStoreHint } from "./record-shopping-item.js";

export function shoppingQueryTokens(
  query: string,
  stopWords: ReadonlySet<string>
): readonly string[] {
  const seen = new Set<string>();

  return normalizeShoppingQueryText(query)
    .split(/\s+/u)
    .map(normalizeShoppingToken)
    .filter((token) => token.length >= 3 && !stopWords.has(token))
    .filter((token) => {
      if (seen.has(token)) {
        return false;
      }

      seen.add(token);
      return true;
    });
}

function normalizeShoppingQueryText(text: string): string {
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

function normalizeShoppingToken(token: string): string {
  if (!/^[а-я]+$/iu.test(token) || token.length <= 4) {
    return token;
  }

  if (/(ами|ями)$/iu.test(token)) {
    return token.slice(0, -3);
  }

  if (/(ов|ев)$/iu.test(token)) {
    return token.slice(0, -2);
  }

  if (/[ауыеи]$/iu.test(token)) {
    return token.slice(0, -1);
  }

  return token;
}
