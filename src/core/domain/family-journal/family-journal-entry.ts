export type FamilyJournalCategory =
  | "health"
  | "child"
  | "sleep"
  | "food"
  | "mood"
  | "school"
  | "milestone"
  | "other";

export type FamilyJournalEntryStatus = "active" | "archived";

export interface FamilyJournalEntry {
  readonly id: string;
  readonly category: FamilyJournalCategory;
  readonly body: string;
  readonly subjectId?: string;
  readonly semanticMemoryEntryId?: string;
  readonly sourceActorId: string;
  readonly sourceChatId: string;
  readonly sourceMessageText: string;
  readonly status: FamilyJournalEntryStatus;
  readonly occurredAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
