import type {
  FamilyJournalCategory,
  FamilyJournalEntry
} from "../../../core/domain/family-journal/family-journal-entry.js";
import { normalizeSubjectId } from "../../../core/domain/family-memory/subject-id.js";
import type { FamilyJournalRepositoryPort } from "../../../ports/family-journal-repository-port.js";
import type { MemoryPort } from "../../../ports/memory-port.js";
import type { SubjectAliasRepositoryPort } from "../../../ports/subject-alias-repository-port.js";

export interface RecordFamilyJournalEntryDependencies {
  readonly repository: FamilyJournalRepositoryPort;
  readonly semanticMemory?: MemoryPort;
  readonly subjectAliases?: SubjectAliasRepositoryPort;
  readonly generateId: () => string;
  readonly now: () => Date;
}

export interface RecordFamilyJournalEntryInput {
  readonly body: string;
  readonly category?: FamilyJournalCategory;
  readonly subjectId?: string;
  readonly occurredAt?: Date;
  readonly sourceActorId: string;
  readonly sourceChatId: string;
  readonly sourceMessageText: string;
}

export interface RecordFamilyJournalEntryResult {
  readonly status: "created";
  readonly entry: FamilyJournalEntry;
}

export class RecordFamilyJournalEntryUseCase {
  constructor(
    private readonly dependencies: RecordFamilyJournalEntryDependencies
  ) {}

  async execute(
    input: RecordFamilyJournalEntryInput
  ): Promise<RecordFamilyJournalEntryResult> {
    const now = this.dependencies.now();
    const subjectId = await this.resolveSubjectId(input.subjectId);
    const entry: FamilyJournalEntry = {
      id: this.dependencies.generateId(),
      category: input.category ?? "other",
      body: input.body.trim(),
      ...(subjectId ? { subjectId } : {}),
      sourceActorId: input.sourceActorId,
      sourceChatId: input.sourceChatId,
      sourceMessageText: input.sourceMessageText,
      status: "active",
      occurredAt: input.occurredAt ?? now,
      createdAt: now,
      updatedAt: now
    };

    await this.dependencies.repository.saveFamilyJournalEntry(entry);
    const savedEntry = await this.storeSemanticSummary(entry);

    return {
      status: "created",
      entry: savedEntry
    };
  }

  private async storeSemanticSummary(
    entry: FamilyJournalEntry
  ): Promise<FamilyJournalEntry> {
    if (!this.dependencies.semanticMemory) {
      return entry;
    }

    try {
      const memoryEntry = await this.dependencies.semanticMemory.store({
        body: formatSemanticMirror(entry),
        references: [`family_journal_entry:${entry.id}`]
      });
      const savedEntry = {
        ...entry,
        semanticMemoryEntryId: memoryEntry.id
      };

      await this.dependencies.repository.saveFamilyJournalEntry(savedEntry);

      return savedEntry;
    } catch {
      return entry;
    }
  }

  private async resolveSubjectId(
    subjectId: string | undefined
  ): Promise<string | undefined> {
    const normalizedSubjectId = normalizeSubjectId(subjectId);

    if (!normalizedSubjectId || !this.dependencies.subjectAliases) {
      return normalizedSubjectId;
    }

    return this.dependencies.subjectAliases.resolveCanonicalSubjectId(
      normalizedSubjectId
    );
  }
}

function formatSemanticMirror(entry: FamilyJournalEntry): string {
  if (entry.subjectId) {
    return `Family journal ${entry.category} entry for ${entry.subjectId}: ${entry.body}`;
  }

  return `Family journal ${entry.category} entry: ${entry.body}`;
}
