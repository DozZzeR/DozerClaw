import { describe, expect, it } from "vitest";

import { ArchiveFamilyFactUseCase } from "../../../../src/application/use-cases/family-memory/archive-family-fact.js";
import type { FamilyFact } from "../../../../src/core/domain/family-memory/family-fact.js";
import type { FamilyMemoryRepositoryPort } from "../../../../src/ports/family-memory-repository-port.js";

describe("ArchiveFamilyFactUseCase", () => {
  it("archives the single active family fact matching the query", async () => {
    const repository = new RecordingFamilyMemoryRepository([
      familyFact({
        id: "fact-unrelated",
        body: "Sofia has a blue backpack.",
        subjectId: "sofia"
      }),
      familyFact({
        id: "fact-match",
        body: "Max prefers chamomile tea before sleep.",
        subjectId: "max"
      })
    ]);
    const useCase = new ArchiveFamilyFactUseCase({
      repository,
      now: () => new Date("2026-07-14T07:00:00.000Z"),
      recentLimit: 20
    });

    await expect(
      useCase.execute({
        query: "forget Max tea"
      })
    ).resolves.toEqual({
      status: "archived",
      fact: {
        ...familyFact({
          id: "fact-match",
          body: "Max prefers chamomile tea before sleep.",
          subjectId: "max"
        }),
        status: "archived",
        updatedAt: new Date("2026-07-14T07:00:00.000Z")
      }
    });
    expect(repository.saved).toEqual({
      ...familyFact({
        id: "fact-match",
        body: "Max prefers chamomile tea before sleep.",
        subjectId: "max"
      }),
      status: "archived",
      updatedAt: new Date("2026-07-14T07:00:00.000Z")
    });
    expect(repository.seenLimit).toBe(20);
  });

  it("archives a specific active fact by id", async () => {
    const repository = new RecordingFamilyMemoryRepository([
      familyFact({
        id: "fact-first",
        body: "Max prefers chamomile tea.",
        subjectId: "max"
      }),
      familyFact({
        id: "fact-second",
        body: "Max prefers peppermint tea.",
        subjectId: "max"
      })
    ]);
    const useCase = new ArchiveFamilyFactUseCase({
      repository,
      now: () => new Date("2026-07-14T07:00:00.000Z"),
      recentLimit: 20
    });

    await expect(
      useCase.execute({
        query: "ignored",
        factId: "fact-second"
      })
    ).resolves.toMatchObject({
      status: "archived",
      fact: {
        id: "fact-second",
        status: "archived",
        updatedAt: new Date("2026-07-14T07:00:00.000Z")
      }
    });
    expect(repository.saved?.id).toBe("fact-second");
  });

  it("does not archive when no active fact matches", async () => {
    const repository = new RecordingFamilyMemoryRepository([
      familyFact({
        id: "fact-unrelated",
        body: "Sofia has a blue backpack.",
        subjectId: "sofia"
      })
    ]);
    const useCase = new ArchiveFamilyFactUseCase({
      repository,
      now: () => new Date("2026-07-14T07:00:00.000Z"),
      recentLimit: 20
    });

    await expect(
      useCase.execute({
        query: "forget Max tea"
      })
    ).resolves.toEqual({
      status: "not_found"
    });
    expect(repository.saved).toBeUndefined();
  });

  it("asks for a more specific query when multiple active facts tie", async () => {
    const repository = new RecordingFamilyMemoryRepository([
      familyFact({
        id: "fact-first",
        body: "Max prefers chamomile tea.",
        subjectId: "max"
      }),
      familyFact({
        id: "fact-second",
        body: "Max prefers peppermint tea.",
        subjectId: "max"
      })
    ]);
    const useCase = new ArchiveFamilyFactUseCase({
      repository,
      now: () => new Date("2026-07-14T07:00:00.000Z"),
      recentLimit: 20
    });

    await expect(
      useCase.execute({
        query: "forget Max tea"
      })
    ).resolves.toEqual({
      status: "ambiguous",
      candidates: [
        familyFact({
          id: "fact-first",
          body: "Max prefers chamomile tea.",
          subjectId: "max"
        }),
        familyFact({
          id: "fact-second",
          body: "Max prefers peppermint tea.",
          subjectId: "max"
        })
      ]
    });
    expect(repository.saved).toBeUndefined();
  });
});

class RecordingFamilyMemoryRepository implements FamilyMemoryRepositoryPort {
  saved: FamilyFact | undefined;
  seenLimit: number | undefined;

  constructor(private readonly facts: readonly FamilyFact[]) {}

  async saveFamilyFact(fact: FamilyFact): Promise<void> {
    this.saved = fact;
  }

  async listRecentActiveFamilyFacts(
    limit: number
  ): Promise<readonly FamilyFact[]> {
    this.seenLimit = limit;

    return this.facts;
  }
}

function familyFact(
  input: Pick<FamilyFact, "id" | "body" | "subjectId">
): FamilyFact {
  return {
    ...input,
    category: "preference",
    sourceActorId: "actor-owner",
    sourceChatId: "chat-family",
    sourceMessageText: input.body,
    status: "active",
    createdAt: new Date("2026-07-07T10:00:00.000Z"),
    updatedAt: new Date("2026-07-07T10:00:00.000Z")
  };
}
