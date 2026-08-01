import { describe, expect, it } from "vitest";

import { RecordFamilyJournalEntryUseCase } from "../../../../src/application/use-cases/family-journal/record-family-journal-entry.js";
import { RecallFamilyJournalEntriesUseCase } from "../../../../src/application/use-cases/family-journal/recall-family-journal-entries.js";
import type { FamilyJournalEntry } from "../../../../src/core/domain/family-journal/family-journal-entry.js";
import type { FamilyJournalRepositoryPort } from "../../../../src/ports/family-journal-repository-port.js";
import type {
  MemoryEntryInput,
  MemoryPort,
  MemorySearchQuery
} from "../../../../src/ports/memory-port.js";
import type { ModelPort, ModelTextRequest } from "../../../../src/ports/model-port.js";
import type { SubjectAliasRepositoryPort } from "../../../../src/ports/subject-alias-repository-port.js";

describe("family journal use cases", () => {
  it("records a structured journal entry and semantic mirror", async () => {
    const repository = new RecordingFamilyJournalRepository();
    const semanticMemory = new RecordingSemanticMemory();
    const useCase = new RecordFamilyJournalEntryUseCase({
      repository,
      semanticMemory,
      generateId: () => "journal-1",
      now: () => new Date("2026-08-01T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        category: "health",
        body: "  Sofia coughed at night but had no fever.  ",
        subjectId: " Sofia ",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-family",
        sourceMessageText: "запиши в дневник здоровья софии кашель ночью"
      })
    ).resolves.toEqual({
      status: "created",
      entry: {
        id: "journal-1",
        category: "health",
        body: "Sofia coughed at night but had no fever.",
        subjectId: "sofia",
        semanticMemoryEntryId: "drawer-1",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-family",
        sourceMessageText: "запиши в дневник здоровья софии кашель ночью",
        status: "active",
        occurredAt: new Date("2026-08-01T10:00:00.000Z"),
        createdAt: new Date("2026-08-01T10:00:00.000Z"),
        updatedAt: new Date("2026-08-01T10:00:00.000Z")
      }
    });
    expect(semanticMemory.stored).toEqual({
      body: "Family journal health entry for sofia: Sofia coughed at night but had no fever.",
      references: ["family_journal_entry:journal-1"]
    });
  });

  it("resolves subject aliases before recording", async () => {
    const repository = new RecordingFamilyJournalRepository();
    const useCase = new RecordFamilyJournalEntryUseCase({
      repository,
      subjectAliases: new StaticSubjectAliases({ sonya: "sofia" }),
      generateId: () => "journal-1",
      now: () => new Date("2026-08-01T10:00:00.000Z")
    });

    await useCase.execute({
      category: "sleep",
      body: "Slept through the night.",
      subjectId: "Sonya",
      sourceActorId: "actor-owner",
      sourceChatId: "chat-family",
      sourceMessageText: "соня спала всю ночь"
    });

    expect(repository.saved?.subjectId).toBe("sofia");
  });

  it("recalls matching recent journal entries", async () => {
    const repository = new RecordingFamilyJournalRepository([
      journalEntry({
        id: "journal-1",
        category: "health",
        body: "Sofia coughed at night.",
        subjectId: "sofia"
      }),
      journalEntry({
        id: "journal-2",
        category: "sleep",
        body: "Max slept badly."
      })
    ]);
    const useCase = new RecallFamilyJournalEntriesUseCase({
      repository,
      recentLimit: 10,
      resultLimit: 5
    });

    await expect(
      useCase.execute({ query: "sofia cough health" })
    ).resolves.toEqual({
      text: [
        "Recent family journal entries:",
        "- [health] Sofia coughed at night. (subject: sofia)"
      ].join("\n")
    });
  });

  it("recalls entries through subject aliases", async () => {
    const repository = new RecordingFamilyJournalRepository([
      journalEntry({
        id: "journal-1",
        category: "health",
        body: "Sofia coughed at night.",
        subjectId: "sofia"
      })
    ]);
    const useCase = new RecallFamilyJournalEntriesUseCase({
      repository,
      subjectAliases: new StaticSubjectAliases({ sonya: "sofia" }),
      recentLimit: 10,
      resultLimit: 5
    });

    await expect(useCase.execute({ query: "sonya health" })).resolves.toEqual({
      text: [
        "Recent family journal entries:",
        "- [health] Sofia coughed at night. (subject: sofia)"
      ].join("\n")
    });
  });

  it("synthesizes a grounded journal recall answer with a model", async () => {
    const model = new RecordingModel(
      JSON.stringify({
        answer: "Sofia coughed at night, but there was no fever.",
        usedJournalEntryIds: ["journal-1"]
      })
    );
    const repository = new RecordingFamilyJournalRepository([
      journalEntry({
        id: "journal-1",
        category: "health",
        body: "Sofia coughed at night but had no fever.",
        subjectId: "sofia"
      })
    ]);
    const useCase = new RecallFamilyJournalEntriesUseCase({
      repository,
      model,
      recentLimit: 10,
      resultLimit: 5
    });

    await expect(useCase.execute({ query: "sofia cough fever" })).resolves.toEqual({
      text: "Sofia coughed at night, but there was no fever."
    });
    expect(model.request?.purpose).toBe(
      "Synthesize DozerClaw family journal answer"
    );
    expect(model.request?.input).toContain("journal-1");
    expect(model.request?.input).toContain("health");
    expect(model.request?.input).toContain("sofia");
    expect(model.request?.outputSchema?.name).toBe(
      "dozerclaw_family_journal_synthesis"
    );
  });

  it("falls back to journal bullets when model synthesis is ungrounded", async () => {
    const model = new RecordingModel(
      JSON.stringify({
        answer: "Sofia had a fever.",
        usedJournalEntryIds: ["unknown-journal"]
      })
    );
    const repository = new RecordingFamilyJournalRepository([
      journalEntry({
        id: "journal-1",
        category: "health",
        body: "Sofia coughed at night but had no fever.",
        subjectId: "sofia"
      })
    ]);
    const useCase = new RecallFamilyJournalEntriesUseCase({
      repository,
      model,
      recentLimit: 10,
      resultLimit: 5
    });

    await expect(useCase.execute({ query: "sofia cough fever" })).resolves.toEqual({
      text: [
        "Recent family journal entries:",
        "- [health] Sofia coughed at night but had no fever. (subject: sofia)"
      ].join("\n")
    });
  });
});

class RecordingFamilyJournalRepository implements FamilyJournalRepositoryPort {
  saved: FamilyJournalEntry | undefined;

  constructor(private readonly entries: readonly FamilyJournalEntry[] = []) {}

  async saveFamilyJournalEntry(entry: FamilyJournalEntry): Promise<void> {
    this.saved = entry;
  }

  async listRecentActiveFamilyJournalEntries(): Promise<readonly FamilyJournalEntry[]> {
    return this.entries;
  }
}

class RecordingSemanticMemory implements MemoryPort {
  stored: MemoryEntryInput | undefined;

  async store(entry: MemoryEntryInput) {
    this.stored = entry;

    return {
      id: "drawer-1",
      body: entry.body
    };
  }

  async search(_query: MemorySearchQuery) {
    return [];
  }
}

class RecordingModel implements ModelPort {
  request: ModelTextRequest | undefined;

  constructor(private readonly responseText: string) {}

  async runTextRequest(request: ModelTextRequest) {
    this.request = request;

    return {
      text: this.responseText
    };
  }
}

class StaticSubjectAliases implements SubjectAliasRepositoryPort {
  constructor(private readonly aliases: Record<string, string>) {}

  async saveSubjectAlias(): Promise<void> {}

  async resolveCanonicalSubjectId(subjectId: string): Promise<string> {
    return this.aliases[subjectId] ?? subjectId;
  }

  async listSubjectAliases() {
    return [];
  }

  async deleteSubjectAlias(): Promise<boolean> {
    return false;
  }
}

function journalEntry(
  input: Pick<FamilyJournalEntry, "id" | "category" | "body"> &
    Partial<FamilyJournalEntry>
): FamilyJournalEntry {
  return {
    sourceActorId: "actor-owner",
    sourceChatId: "chat-family",
    sourceMessageText: input.body,
    status: "active",
    occurredAt: new Date("2026-08-01T10:00:00.000Z"),
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    ...input
  };
}
