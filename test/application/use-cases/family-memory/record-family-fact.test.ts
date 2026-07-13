import { describe, expect, it } from "vitest";

import { RecordFamilyFactUseCase } from "../../../../src/application/use-cases/family-memory/record-family-fact.js";
import type { FamilyFact } from "../../../../src/core/domain/family-memory/family-fact.js";
import type { FamilyMemoryRepositoryPort } from "../../../../src/ports/family-memory-repository-port.js";
import type {
  MemoryEntryInput,
  MemoryPort,
  MemorySearchQuery
} from "../../../../src/ports/memory-port.js";

describe("RecordFamilyFactUseCase", () => {
  it("stores a trimmed active family fact with source metadata", async () => {
    const repository = new RecordingFamilyMemoryRepository();
    const useCase = new RecordFamilyFactUseCase({
      repository,
      generateId: () => "fact-1",
      now: () => new Date("2026-07-07T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        summary: "  Max prefers chamomile tea before sleep.  ",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-family",
        sourceMessageText: "remember that Max prefers chamomile tea before sleep"
      })
    ).resolves.toEqual({
      status: "created",
      fact: {
        id: "fact-1",
        category: "preference",
        body: "Max prefers chamomile tea before sleep.",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-family",
        sourceMessageText: "remember that Max prefers chamomile tea before sleep",
        status: "active",
        createdAt: new Date("2026-07-07T10:00:00.000Z"),
        updatedAt: new Date("2026-07-07T10:00:00.000Z")
      }
    });
    expect(repository.saved).toEqual({
      id: "fact-1",
      category: "preference",
      body: "Max prefers chamomile tea before sleep.",
      sourceActorId: "actor-owner",
      sourceChatId: "chat-family",
      sourceMessageText: "remember that Max prefers chamomile tea before sleep",
      status: "active",
      createdAt: new Date("2026-07-07T10:00:00.000Z"),
      updatedAt: new Date("2026-07-07T10:00:00.000Z")
    });
  });

  it("stores a semantic summary when memory is configured", async () => {
    const semanticMemory = new RecordingSemanticMemory();
    const repository = new RecordingFamilyMemoryRepository();
    const useCase = new RecordFamilyFactUseCase({
      repository,
      semanticMemory,
      generateId: () => "fact-1",
      now: () => new Date("2026-07-07T10:00:00.000Z")
    });

    await useCase.execute({
      summary: "Max prefers chamomile tea before sleep.",
      sourceActorId: "actor-owner",
      sourceChatId: "chat-family",
      sourceMessageText: "remember that Max prefers chamomile tea before sleep"
    });

    expect(semanticMemory.stored).toEqual({
      body: "Family fact: Max prefers chamomile tea before sleep.",
      references: ["family_fact:fact-1"]
    });
    expect(repository.saved?.semanticMemoryEntryId).toBe("drawer-1");
  });

  it("stores supplied category and subject id", async () => {
    const repository = new RecordingFamilyMemoryRepository();
    const useCase = new RecordFamilyFactUseCase({
      repository,
      generateId: () => "fact-1",
      now: () => new Date("2026-07-07T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        summary: "Max started swimming lessons.",
        category: "event",
        subjectId: "max",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-family",
        sourceMessageText: "remember Max started swimming lessons"
      })
    ).resolves.toEqual({
      status: "created",
      fact: expect.objectContaining({
        id: "fact-1",
        category: "event",
        subjectId: "max",
        body: "Max started swimming lessons."
      })
    });
    expect(repository.saved).toEqual(
      expect.objectContaining({
        category: "event",
        subjectId: "max"
      })
    );
  });

  it("keeps the structured save when semantic memory fails", async () => {
    const repository = new RecordingFamilyMemoryRepository();
    const useCase = new RecordFamilyFactUseCase({
      repository,
      semanticMemory: new ThrowingSemanticMemory(),
      generateId: () => "fact-1",
      now: () => new Date("2026-07-07T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        summary: "Max prefers chamomile tea before sleep.",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-family",
        sourceMessageText: "remember that Max prefers chamomile tea before sleep"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: "created",
        fact: expect.objectContaining({
          id: "fact-1",
          body: "Max prefers chamomile tea before sleep."
        })
      })
    );
    expect(repository.saved?.body).toBe("Max prefers chamomile tea before sleep.");
  });

  it("asks for confirmation when a related active fact already exists", async () => {
    const existingFact = familyFact({
      id: "fact-existing",
      body: "Max prefers chamomile tea before sleep."
    });
    const repository = new RecordingFamilyMemoryRepository([existingFact]);
    const semanticMemory = new RecordingSemanticMemory();
    const useCase = new RecordFamilyFactUseCase({
      repository,
      semanticMemory,
      generateId: () => "fact-new",
      now: () => new Date("2026-07-07T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        summary: "Max prefers tea before bedtime.",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-family",
        sourceMessageText: "remember Max prefers tea before bedtime"
      })
    ).resolves.toEqual({
      status: "needs_confirmation",
      newFact: {
        id: "fact-new",
        category: "preference",
        body: "Max prefers tea before bedtime.",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-family",
        sourceMessageText: "remember Max prefers tea before bedtime",
        status: "active",
        createdAt: new Date("2026-07-07T10:00:00.000Z"),
        updatedAt: new Date("2026-07-07T10:00:00.000Z")
      },
      candidates: [existingFact]
    });
    expect(repository.saved).toBeUndefined();
    expect(semanticMemory.stored).toBeUndefined();
  });

  it("does not ask for confirmation when explicit subject ids differ", async () => {
    const existingFact = familyFact({
      id: "fact-existing",
      body: "Sofia prefers chamomile tea before sleep.",
      subjectId: "sofia"
    });
    const repository = new RecordingFamilyMemoryRepository([existingFact]);
    const useCase = new RecordFamilyFactUseCase({
      repository,
      generateId: () => "fact-new",
      now: () => new Date("2026-07-07T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        summary: "Max prefers chamomile tea before sleep.",
        subjectId: "max",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-family",
        sourceMessageText: "remember Max prefers chamomile tea before sleep"
      })
    ).resolves.toEqual({
      status: "created",
      fact: expect.objectContaining({
        id: "fact-new",
        subjectId: "max"
      })
    });
    expect(repository.saved).toEqual(
      expect.objectContaining({
        id: "fact-new",
        subjectId: "max"
      })
    );
  });

  it("asks for confirmation for matching subject ids with lower token overlap", async () => {
    const existingFact = familyFact({
      id: "fact-existing",
      body: "Max likes pasta.",
      subjectId: "max"
    });
    const repository = new RecordingFamilyMemoryRepository([existingFact]);
    const useCase = new RecordFamilyFactUseCase({
      repository,
      generateId: () => "fact-new",
      now: () => new Date("2026-07-07T10:00:00.000Z")
    });

    await expect(
      useCase.execute({
        summary: "Max likes soup.",
        subjectId: "max",
        sourceActorId: "actor-owner",
        sourceChatId: "chat-family",
        sourceMessageText: "remember Max likes soup"
      })
    ).resolves.toEqual({
      status: "needs_confirmation",
      newFact: expect.objectContaining({
        id: "fact-new",
        subjectId: "max"
      }),
      candidates: [existingFact]
    });
    expect(repository.saved).toBeUndefined();
  });
});

class RecordingFamilyMemoryRepository implements FamilyMemoryRepositoryPort {
  saved: FamilyFact | undefined;

  constructor(private readonly facts: readonly FamilyFact[] = []) {}

  async saveFamilyFact(fact: FamilyFact): Promise<void> {
    this.saved = fact;
  }

  async listRecentActiveFamilyFacts(): Promise<readonly FamilyFact[]> {
    return this.facts;
  }
}

class RecordingSemanticMemory implements MemoryPort {
  stored: MemoryEntryInput | undefined;

  async store(input: MemoryEntryInput) {
    this.stored = input;

    return {
      id: "drawer-1",
      body: input.body
    };
  }

  async search(_query: MemorySearchQuery) {
    return [];
  }
}

class ThrowingSemanticMemory extends RecordingSemanticMemory {
  async store(): Promise<never> {
    throw new Error("semantic memory unavailable");
  }
}

function familyFact(
  input: Pick<FamilyFact, "id" | "body"> & {
    readonly subjectId?: string;
  }
): FamilyFact {
  return {
    id: input.id,
    category: "preference",
    body: input.body,
    ...(input.subjectId ? { subjectId: input.subjectId } : {}),
    sourceActorId: "actor-owner",
    sourceChatId: "chat-family",
    sourceMessageText: input.body,
    status: "active",
    createdAt: new Date("2026-07-07T09:00:00.000Z"),
    updatedAt: new Date("2026-07-07T09:00:00.000Z")
  };
}
