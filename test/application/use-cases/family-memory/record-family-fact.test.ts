import { describe, expect, it } from "vitest";

import { RecordFamilyFactUseCase } from "../../../../src/application/use-cases/family-memory/record-family-fact.js";
import type { FamilyFact } from "../../../../src/core/domain/family-memory/family-fact.js";
import type { FamilyMemoryRepositoryPort } from "../../../../src/ports/family-memory-repository-port.js";

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
