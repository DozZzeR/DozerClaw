export interface MemoryPort {
  store(entry: MemoryEntryInput): Promise<MemoryEntry>;
  update?(entryId: string, entry: MemoryEntryInput): Promise<MemoryEntry>;
  replace?(entry: MemoryEntryInput): Promise<MemoryEntry>;
  search(query: MemorySearchQuery): Promise<readonly MemorySearchResult[]>;
}

export interface MemoryEntryInput {
  readonly body: string;
  readonly references?: readonly string[];
}

export interface MemoryEntry {
  readonly id: string;
  readonly body: string;
}

export interface MemorySearchQuery {
  readonly text: string;
  readonly limit: number;
}

export interface MemorySearchResult {
  readonly entry: MemoryEntry;
  readonly score?: number;
}
