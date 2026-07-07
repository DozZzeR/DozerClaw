export type FamilyFactCategory =
  | "event"
  | "preference"
  | "place"
  | "reference_link";

export type FamilyFactStatus = "active" | "archived";

export interface FamilyFact {
  readonly id: string;
  readonly category: FamilyFactCategory;
  readonly body: string;
  readonly subjectId?: string;
  readonly sourceActorId: string;
  readonly sourceChatId: string;
  readonly sourceMessageText: string;
  readonly status: FamilyFactStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
