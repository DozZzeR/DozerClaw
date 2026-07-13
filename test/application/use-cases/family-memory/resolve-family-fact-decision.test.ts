import { describe, expect, it } from "vitest";

import { ResolveFamilyFactDecisionUseCase } from "../../../../src/application/use-cases/family-memory/resolve-family-fact-decision.js";
import type { FamilyFact } from "../../../../src/core/domain/family-memory/family-fact.js";
import type { FamilyMemoryRepositoryPort } from "../../../../src/ports/family-memory-repository-port.js";
import type {
  MemoryEntryInput,
  MemoryPort,
  MemorySearchQuery
} from "../../../../src/ports/memory-port.js";
import type { PendingFamilyFactDecision } from "../../../../src/ports/state-repository-port.js";

describe("ResolveFamilyFactDecisionUseCase", () => {
  it("updates the first candidate with the pending new fact content", async () => {
    const repository = new RecordingFamilyMemoryRepository();
    const semanticMemory = new RecordingSemanticMemory();
    const useCase = new ResolveFamilyFactDecisionUseCase({
      repository,
      semanticMemory,
      now: () => new Date("2026-07-07T10:05:00.000Z")
    });

    await expect(
      useCase.execute({
        decision: "update",
        pending: pendingDecision()
      })
    ).resolves.toEqual({
      status: "updated",
      fact: {
        ...pendingDecision().newFact,
        id: "fact-existing",
        createdAt: new Date("2026-07-07T09:00:00.000Z"),
        updatedAt: new Date("2026-07-07T10:05:00.000Z")
      }
    });
    expect(repository.saved).toEqual({
      ...pendingDecision().newFact,
      id: "fact-existing",
      createdAt: new Date("2026-07-07T09:00:00.000Z"),
      updatedAt: new Date("2026-07-07T10:05:00.000Z")
    });
    expect(semanticMemory.stored).toEqual({
      mode: "replace",
      body: "Family fact: Max prefers tea before bedtime.",
      references: ["family_fact:fact-existing"]
    });
  });

  it("updates the selected candidate by index", async () => {
    const repository = new RecordingFamilyMemoryRepository();
    const useCase = new ResolveFamilyFactDecisionUseCase({
      repository,
      now: () => new Date("2026-07-07T10:05:00.000Z")
    });

    await expect(
      useCase.execute({
        decision: "update",
        candidateIndex: 1,
        pending: pendingDecision({
          candidates: [
            familyFact({
              id: "fact-first",
              body: "Max prefers chamomile tea before sleep.",
              createdAt: new Date("2026-07-07T09:00:00.000Z")
            }),
            familyFact({
              id: "fact-second",
              body: "Max likes peppermint tea.",
              createdAt: new Date("2026-07-07T08:00:00.000Z")
            })
          ]
        })
      })
    ).resolves.toEqual({
      status: "updated",
      fact: {
        ...pendingDecision().newFact,
        id: "fact-second",
        createdAt: new Date("2026-07-07T08:00:00.000Z"),
        updatedAt: new Date("2026-07-07T10:05:00.000Z")
      }
    });
    expect(repository.saved?.id).toBe("fact-second");
  });

  it("falls back to the first candidate when selected index is out of range", async () => {
    const repository = new RecordingFamilyMemoryRepository();
    const useCase = new ResolveFamilyFactDecisionUseCase({
      repository,
      now: () => new Date("2026-07-07T10:05:00.000Z")
    });

    await useCase.execute({
      decision: "update",
      candidateIndex: 8,
      pending: pendingDecision()
    });

    expect(repository.saved?.id).toBe("fact-existing");
  });

  it("creates the pending new fact", async () => {
    const repository = new RecordingFamilyMemoryRepository();
    const useCase = new ResolveFamilyFactDecisionUseCase({
      repository,
      now: () => new Date("2026-07-07T10:05:00.000Z")
    });

    await expect(
      useCase.execute({
        decision: "create",
        pending: pendingDecision()
      })
    ).resolves.toEqual({
      status: "created",
      fact: pendingDecision().newFact
    });
    expect(repository.saved).toEqual(pendingDecision().newFact);
  });

  it("cancels without saving", async () => {
    const repository = new RecordingFamilyMemoryRepository();
    const useCase = new ResolveFamilyFactDecisionUseCase({
      repository,
      now: () => new Date("2026-07-07T10:05:00.000Z")
    });

    await expect(
      useCase.execute({
        decision: "cancel",
        pending: pendingDecision()
      })
    ).resolves.toEqual({
      status: "cancelled"
    });
    expect(repository.saved).toBeUndefined();
  });

  it("keeps the structured save when semantic memory fails", async () => {
    const repository = new RecordingFamilyMemoryRepository();
    const useCase = new ResolveFamilyFactDecisionUseCase({
      repository,
      semanticMemory: new ThrowingSemanticMemory(),
      now: () => new Date("2026-07-07T10:05:00.000Z")
    });

    await expect(
      useCase.execute({
        decision: "create",
        pending: pendingDecision()
      })
    ).resolves.toEqual({
      status: "created",
      fact: pendingDecision().newFact
    });
    expect(repository.saved).toEqual(pendingDecision().newFact);
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
  stored: (MemoryEntryInput & { readonly mode: "store" | "replace" }) | undefined;

  async store(input: MemoryEntryInput) {
    this.stored = {
      ...input,
      mode: "store"
    };

    return {
      id: "drawer-1",
      body: input.body
    };
  }

  async replace(input: MemoryEntryInput) {
    this.stored = {
      ...input,
      mode: "replace"
    };

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

function pendingDecision(
  overrides: {
    readonly candidates?: readonly FamilyFact[];
  } = {}
): PendingFamilyFactDecision {
  return {
    chatId: "chat-family",
    actorId: "actor-owner",
    newFact: familyFact({
      id: "fact-new",
      body: "Max prefers tea before bedtime.",
      createdAt: new Date("2026-07-07T10:00:00.000Z")
    }),
    candidates: overrides.candidates ?? [
      familyFact({
        id: "fact-existing",
        body: "Max prefers chamomile tea before sleep.",
        createdAt: new Date("2026-07-07T09:00:00.000Z")
      })
    ],
    createdAt: new Date("2026-07-07T10:00:00.000Z"),
    expiresAt: new Date("2026-07-07T10:30:00.000Z")
  };
}

function familyFact(input: {
  readonly id: string;
  readonly body: string;
  readonly createdAt: Date;
}): FamilyFact {
  return {
    id: input.id,
    category: "preference",
    body: input.body,
    sourceActorId: "actor-owner",
    sourceChatId: "chat-family",
    sourceMessageText: input.body,
    status: "active",
    createdAt: input.createdAt,
    updatedAt: input.createdAt
  };
}
