import type { ShoppingItem } from "../../../core/domain/shopping/shopping-item.js";
import type { MemoryPort } from "../../../ports/memory-port.js";
import type { ShoppingRepositoryPort } from "../../../ports/shopping-repository-port.js";

export interface RecordShoppingItemDependencies {
  readonly repository: ShoppingRepositoryPort;
  readonly semanticMemory?: MemoryPort;
  readonly generateId: () => string;
  readonly now: () => Date;
}

export interface RecordShoppingItemInput {
  readonly title: string;
  readonly storeHint?: string;
  readonly projectTag?: string;
  readonly tags?: readonly string[];
  readonly sourceActorId: string;
  readonly sourceChatId: string;
  readonly sourceMessageText: string;
}

export interface RecordShoppingItemResult {
  readonly status: "created";
  readonly item: ShoppingItem;
}

export class RecordShoppingItemUseCase {
  constructor(private readonly dependencies: RecordShoppingItemDependencies) {}

  async execute(input: RecordShoppingItemInput): Promise<RecordShoppingItemResult> {
    const now = this.dependencies.now();
    const item: ShoppingItem = {
      id: this.dependencies.generateId(),
      title: input.title.trim(),
      ...optionalStoreHint(input.storeHint),
      ...optionalProjectTag(input.projectTag),
      tags: normalizeTags(input.tags ?? []),
      sourceActorId: input.sourceActorId,
      sourceChatId: input.sourceChatId,
      sourceMessageText: input.sourceMessageText,
      status: "open",
      createdAt: now,
      updatedAt: now
    };

    await this.dependencies.repository.saveShoppingItem(item);
    const savedItem = await this.storeSemanticMirror(item);

    return {
      status: "created",
      item: savedItem
    };
  }

  private async storeSemanticMirror(item: ShoppingItem): Promise<ShoppingItem> {
    if (!this.dependencies.semanticMemory) {
      return item;
    }

    try {
      const memoryEntry = await this.dependencies.semanticMemory.store({
        body: formatSemanticMirror(item),
        references: [`shopping_item:${item.id}`]
      });
      const savedItem = {
        ...item,
        semanticMemoryEntryId: memoryEntry.id
      };

      await this.dependencies.repository.saveShoppingItem(savedItem);

      return savedItem;
    } catch {
      return item;
    }
  }
}

export function normalizeShoppingStoreHint(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase().replace(/ё/gu, "е");

  if (!normalized) {
    return undefined;
  }

  if (/^(уради\s*сам|uradi\s*sam|uradisam)$/iu.test(normalized)) {
    return "uradi_sam";
  }

  return normalized.replace(/\s+/gu, "_");
}

function optionalStoreHint(
  value: string | undefined
): { readonly storeHint?: string } {
  const storeHint = normalizeShoppingStoreHint(value);

  return storeHint ? { storeHint } : {};
}

function optionalProjectTag(
  value: string | undefined
): { readonly projectTag?: string } {
  const projectTag = value?.trim();

  return projectTag ? { projectTag } : {};
}

function normalizeTags(tags: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const normalizedTags: string[] = [];

  for (const tag of tags) {
    const normalized = tag.trim();

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    normalizedTags.push(normalized);
  }

  return normalizedTags;
}

function formatSemanticMirror(item: ShoppingItem): string {
  const scopes = [
    item.storeHint ? `for ${item.storeHint}` : undefined,
    item.projectTag ? `project ${item.projectTag}` : undefined
  ].filter((scope): scope is string => Boolean(scope));
  const tags = item.tags.length > 0 ? ` (tags: ${item.tags.join(", ")})` : "";

  if (scopes.length > 0) {
    return `Shopping item ${scopes.join(", ")}: ${item.title}${tags}`;
  }

  return `Shopping item: ${item.title}${tags}`;
}
