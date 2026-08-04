export type ShoppingItemStatus = "open" | "bought" | "archived";

export interface ShoppingItem {
  readonly id: string;
  readonly title: string;
  readonly storeHint?: string;
  readonly projectTag?: string;
  readonly tags: readonly string[];
  readonly semanticMemoryEntryId?: string;
  readonly sourceActorId: string;
  readonly sourceChatId: string;
  readonly sourceMessageText: string;
  readonly status: ShoppingItemStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
