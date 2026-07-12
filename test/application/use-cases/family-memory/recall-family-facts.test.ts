import { describe, expect, it } from "vitest";

import { RecallFamilyFactsUseCase } from "../../../../src/application/use-cases/family-memory/recall-family-facts.js";
import type { FamilyFact } from "../../../../src/core/domain/family-memory/family-fact.js";
import type { FamilyMemoryRepositoryPort } from "../../../../src/ports/family-memory-repository-port.js";

describe("RecallFamilyFactsUseCase", () => {
  it("returns an empty-state reply when no active family facts exist", async () => {
    const repository = new StubFamilyMemoryRepository([]);
    const useCase = new RecallFamilyFactsUseCase({
      repository,
      recentLimit: 5
    });

    await expect(
      useCase.execute({
        query: "what do you remember?"
      })
    ).resolves.toEqual({
      text: "I do not have any saved family facts yet."
    });
    expect(repository.seenLimit).toBe(5);
  });

  it("formats recent active family facts newest first", async () => {
    const repository = new StubFamilyMemoryRepository([
      familyFact({
        id: "fact-new",
        category: "preference",
        body: "Max prefers chamomile tea before sleep."
      }),
      familyFact({
        id: "fact-old",
        category: "event",
        body: "Max started swimming lessons."
      })
    ]);
    const useCase = new RecallFamilyFactsUseCase({
      repository,
      recentLimit: 10
    });

    await expect(
      useCase.execute({
        query: "what do you remember about Max?"
      })
    ).resolves.toEqual({
      text: [
        "Saved family facts:",
        "- Max prefers chamomile tea before sleep.",
        "- Max started swimming lessons."
      ].join("\n")
    });
    expect(repository.seenLimit).toBe(10);
  });
});

class StubFamilyMemoryRepository implements FamilyMemoryRepositoryPort {
  seenLimit: number | undefined;

  constructor(private readonly facts: readonly FamilyFact[]) {}

  async saveFamilyFact(): Promise<void> {}

  async listRecentActiveFamilyFacts(
    limit: number
  ): Promise<readonly FamilyFact[]> {
    this.seenLimit = limit;

    return this.facts;
  }
}

function familyFact(
  input: Pick<FamilyFact, "id" | "category" | "body">
): FamilyFact {
  return {
    ...input,
    sourceActorId: "actor-owner",
    sourceChatId: "chat-family",
    sourceMessageText: input.body,
    status: "active",
    createdAt: new Date("2026-07-07T10:00:00.000Z"),
    updatedAt: new Date("2026-07-07T10:00:00.000Z")
  };
}
