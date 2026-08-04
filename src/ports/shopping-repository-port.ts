import type { ShoppingItem } from "../core/domain/shopping/shopping-item.js";

export interface ShoppingRepositoryPort {
  saveShoppingItem(item: ShoppingItem): Promise<void>;
  listRecentOpenShoppingItems(limit: number): Promise<readonly ShoppingItem[]>;
}
