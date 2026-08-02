import type { FamilyJournalEntry } from "../../../core/domain/family-journal/family-journal-entry.js";
import type { FamilyJournalRepositoryPort } from "../../../ports/family-journal-repository-port.js";
import type { MemoryPort } from "../../../ports/memory-port.js";

export interface UpdateFamilyJournalEntryDependencies {
  readonly repository: FamilyJournalRepositoryPort;
  readonly semanticMemory?: MemoryPort;
  readonly now: () => Date;
}

export interface UpdateFamilyJournalEntryInput {
  readonly entryId: string;
  readonly body: string;
}

export type UpdateFamilyJournalEntryResult =
  | {
      readonly status: "updated";
      readonly entry: FamilyJournalEntry;
    }
  | {
      readonly status: "not_found";
    };

export class UpdateFamilyJournalEntryUseCase {
  constructor(
    private readonly dependencies: UpdateFamilyJournalEntryDependencies
  ) {}

  async execute(
    input: UpdateFamilyJournalEntryInput
  ): Promise<UpdateFamilyJournalEntryResult> {
    const entry = await this.dependencies.repository.findFamilyJournalEntryById?.(
      input.entryId
    );

    if (!entry || entry.status !== "active") {
      return {
        status: "not_found"
      };
    }

    const updatedEntry: FamilyJournalEntry = {
      ...entry,
      body: input.body.trim(),
      updatedAt: this.dependencies.now()
    };

    await this.dependencies.repository.saveFamilyJournalEntry(updatedEntry);
    const savedEntry = await this.updateSemanticSummary(updatedEntry);

    return {
      status: "updated",
      entry: savedEntry
    };
  }

  private async updateSemanticSummary(
    entry: FamilyJournalEntry
  ): Promise<FamilyJournalEntry> {
    if (!this.dependencies.semanticMemory) {
      return entry;
    }

    try {
      const input = {
        body: formatSemanticMirror(entry),
        references: [`family_journal_entry:${entry.id}`]
      };

      if (
        entry.semanticMemoryEntryId &&
        this.dependencies.semanticMemory.update
      ) {
        await this.dependencies.semanticMemory.update(
          entry.semanticMemoryEntryId,
          input
        );

        return entry;
      }

      if (this.dependencies.semanticMemory.replace) {
        const memoryEntry = await this.dependencies.semanticMemory.replace(input);
        const savedEntry = {
          ...entry,
          semanticMemoryEntryId: memoryEntry.id
        };

        await this.dependencies.repository.saveFamilyJournalEntry(savedEntry);

        return savedEntry;
      }

      const memoryEntry = await this.dependencies.semanticMemory.store(input);
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
}

function formatSemanticMirror(entry: FamilyJournalEntry): string {
  if (entry.subjectId) {
    return `Family journal ${entry.category} entry for ${entry.subjectId}: ${entry.body}`;
  }

  return `Family journal ${entry.category} entry: ${entry.body}`;
}
