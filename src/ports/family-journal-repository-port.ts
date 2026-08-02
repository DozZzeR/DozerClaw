import type { FamilyJournalEntry } from "../core/domain/family-journal/family-journal-entry.js";

export interface FamilyJournalRepositoryPort {
  saveFamilyJournalEntry(entry: FamilyJournalEntry): Promise<void>;
  findFamilyJournalEntryById?(
    id: string
  ): Promise<FamilyJournalEntry | undefined>;
  listRecentActiveFamilyJournalEntries(
    limit: number
  ): Promise<readonly FamilyJournalEntry[]>;
}
