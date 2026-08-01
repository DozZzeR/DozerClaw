import type { FamilyJournalEntry } from "../core/domain/family-journal/family-journal-entry.js";

export interface FamilyJournalRepositoryPort {
  saveFamilyJournalEntry(entry: FamilyJournalEntry): Promise<void>;
  listRecentActiveFamilyJournalEntries(
    limit: number
  ): Promise<readonly FamilyJournalEntry[]>;
}
