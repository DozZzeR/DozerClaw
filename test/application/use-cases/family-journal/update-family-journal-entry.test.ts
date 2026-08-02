import { describe, expect, it } from "vitest";

import { UpdateFamilyJournalEntryUseCase } from "../../../../src/application/use-cases/family-journal/update-family-journal-entry.js";
import type { FamilyJournalEntry } from "../../../../src/core/domain/family-journal/family-journal-entry.js";
import type { FamilyJournalRepositoryPort } from "../../../../src/ports/family-journal-repository-port.js";
import type {
  MemoryEntryInput,
  MemoryPort,
  MemorySearchQuery
} from "../../../../src/ports/memory-port.js";

describe("UpdateFamilyJournalEntryUseCase", () => {
  it("updates an active family journal entry and semantic mirror", async () => {
    const repository = new RecordingFamilyJournalRepository(
      familyJournalEntry({
        id: "journal-1",
        body: "Sofia coughed at night but had no fever.",
        semanticMemoryEntryId: "drawer-1"
      })
    );
    const semanticMemory = new RecordingSemanticMemory();
    const useCase = new UpdateFamilyJournalEntryUseCase({
      repository,
      semanticMemory,
      now: () => new Date("2026-08-02T09:00:00.000Z")
    });

    await expect(
      useCase.execute({
        entryId: "journal-1",
        body: " Sofia coughed twice at night and had no fever. "
      })
    ).resolves.toEqual({
      status: "updated",
      entry: expect.objectContaining({
        id: "journal-1",
        body: "Sofia coughed twice at night and had no fever.",
        updatedAt: new Date("2026-08-02T09:00:00.000Z")
      })
    });
    expect(repository.saved?.body).toBe(
      "Sofia coughed twice at night and had no fever."
    );
    expect(semanticMemory.updated).toEqual({
      id: "drawer-1",
      input: {
        body: "Family journal health entry for sofia: Sofia coughed twice at night and had no fever.",
        references: ["family_journal_entry:journal-1"]
      }
    });
  });

  it("returns not found when the entry cannot be loaded", async () => {
    const useCase = new UpdateFamilyJournalEntryUseCase({
      repository: new RecordingFamilyJournalRepository(undefined),
      now: () => new Date("2026-08-02T09:00:00.000Z")
    });

    await expect(
      useCase.execute({
        entryId: "missing",
        body: "New body"
      })
    ).resolves.toEqual({
      status: "not_found"
    });
  });
});

class RecordingFamilyJournalRepository implements FamilyJournalRepositoryPort {
  saved: FamilyJournalEntry | undefined;

  constructor(private readonly entry: FamilyJournalEntry | undefined) {}

  async saveFamilyJournalEntry(entry: FamilyJournalEntry): Promise<void> {
    this.saved = entry;
  }

  async findFamilyJournalEntryById(): Promise<FamilyJournalEntry | undefined> {
    return this.entry;
  }

  async listRecentActiveFamilyJournalEntries(): Promise<readonly FamilyJournalEntry[]> {
    return this.entry ? [this.entry] : [];
  }
}

class RecordingSemanticMemory implements MemoryPort {
  updated: { readonly id: string; readonly input: MemoryEntryInput } | undefined;

  async store(input: MemoryEntryInput) {
    return {
      id: "drawer-new",
      body: input.body
    };
  }

  async update(id: string, input: MemoryEntryInput) {
    this.updated = { id, input };

    return {
      id,
      body: input.body
    };
  }

  async search(_query: MemorySearchQuery) {
    return [];
  }
}

function familyJournalEntry(
  input: Pick<FamilyJournalEntry, "id" | "body"> & {
    readonly semanticMemoryEntryId?: string;
  }
): FamilyJournalEntry {
  return {
    id: input.id,
    category: "health",
    body: input.body,
    subjectId: "sofia",
    ...(input.semanticMemoryEntryId
      ? { semanticMemoryEntryId: input.semanticMemoryEntryId }
      : {}),
    sourceActorId: "actor-owner",
    sourceChatId: "chat-family",
    sourceMessageText: input.body,
    status: "active",
    occurredAt: new Date("2026-08-01T10:00:00.000Z"),
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-01T10:00:00.000Z")
  };
}
