import { describe, expect, it } from "vitest";

import { UpdateFamilyFactUseCase } from "../../../../src/application/use-cases/family-memory/update-family-fact.js";
import type { FamilyFact } from "../../../../src/core/domain/family-memory/family-fact.js";
import type { FamilyMemoryRepositoryPort } from "../../../../src/ports/family-memory-repository-port.js";
import type {
  MemoryEntryInput,
  MemoryPort,
  MemorySearchQuery
} from "../../../../src/ports/memory-port.js";

describe("UpdateFamilyFactUseCase", () => {
  it("updates an active family fact and semantic mirror", async () => {
    const repository = new RecordingFamilyMemoryRepository(
      familyFact({
        id: "fact-1",
        body: "Max prefers chamomile tea before sleep.",
        semanticMemoryEntryId: "drawer-1"
      })
    );
    const semanticMemory = new RecordingSemanticMemory();
    const useCase = new UpdateFamilyFactUseCase({
      repository,
      semanticMemory,
      now: () => new Date("2026-08-02T09:00:00.000Z")
    });

    await expect(
      useCase.execute({
        factId: "fact-1",
        body: " Max prefers mint tea before bedtime. "
      })
    ).resolves.toEqual({
      status: "updated",
      fact: expect.objectContaining({
        id: "fact-1",
        body: "Max prefers mint tea before bedtime.",
        updatedAt: new Date("2026-08-02T09:00:00.000Z")
      })
    });
    expect(repository.saved?.body).toBe("Max prefers mint tea before bedtime.");
    expect(semanticMemory.updated).toEqual({
      id: "drawer-1",
      input: {
        body: "Family fact: Max prefers mint tea before bedtime.",
        references: ["family_fact:fact-1"]
      }
    });
  });

  it("returns not found when the fact cannot be loaded", async () => {
    const useCase = new UpdateFamilyFactUseCase({
      repository: new RecordingFamilyMemoryRepository(undefined),
      now: () => new Date("2026-08-02T09:00:00.000Z")
    });

    await expect(
      useCase.execute({
        factId: "missing",
        body: "New body"
      })
    ).resolves.toEqual({
      status: "not_found"
    });
  });
});

class RecordingFamilyMemoryRepository implements FamilyMemoryRepositoryPort {
  saved: FamilyFact | undefined;

  constructor(private readonly fact: FamilyFact | undefined) {}

  async saveFamilyFact(fact: FamilyFact): Promise<void> {
    this.saved = fact;
  }

  async findFamilyFactById(): Promise<FamilyFact | undefined> {
    return this.fact;
  }

  async listRecentActiveFamilyFacts(): Promise<readonly FamilyFact[]> {
    return this.fact ? [this.fact] : [];
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

function familyFact(
  input: Pick<FamilyFact, "id" | "body"> & {
    readonly semanticMemoryEntryId?: string;
  }
): FamilyFact {
  return {
    id: input.id,
    category: "preference",
    body: input.body,
    ...(input.semanticMemoryEntryId
      ? { semanticMemoryEntryId: input.semanticMemoryEntryId }
      : {}),
    sourceActorId: "actor-owner",
    sourceChatId: "chat-family",
    sourceMessageText: input.body,
    status: "active",
    createdAt: new Date("2026-07-07T10:00:00.000Z"),
    updatedAt: new Date("2026-07-07T10:00:00.000Z")
  };
}
