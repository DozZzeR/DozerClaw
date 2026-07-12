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
    const useCase = new RecordFamilyFactUseCase({
      repository: new RecordingFamilyMemoryRepository(),
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
        id: "fact-1",
        body: "Max prefers chamomile tea before sleep."
      })
    );
    expect(repository.saved?.body).toBe("Max prefers chamomile tea before sleep.");
  });
});

class RecordingFamilyMemoryRepository implements FamilyMemoryRepositoryPort {
  saved: FamilyFact | undefined;

  async saveFamilyFact(fact: FamilyFact): Promise<void> {
    this.saved = fact;
  }

  async listRecentActiveFamilyFacts(): Promise<readonly FamilyFact[]> {
    return [];
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
