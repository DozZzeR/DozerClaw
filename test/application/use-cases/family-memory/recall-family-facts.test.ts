import { describe, expect, it } from "vitest";

import { RecallFamilyFactsUseCase } from "../../../../src/application/use-cases/family-memory/recall-family-facts.js";
import type { FamilyFact } from "../../../../src/core/domain/family-memory/family-fact.js";
import type { FamilyMemoryRepositoryPort } from "../../../../src/ports/family-memory-repository-port.js";
import type {
  MemoryEntryInput,
  MemoryPort,
  MemorySearchQuery,
  MemorySearchResult
} from "../../../../src/ports/memory-port.js";
import type {
  ModelPort,
  ModelTextRequest,
  ModelTextResponse
} from "../../../../src/ports/model-port.js";
import type { SubjectAliasRepositoryPort } from "../../../../src/ports/subject-alias-repository-port.js";

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

  it("filters unrelated facts when the query matches at least one fact", async () => {
    const repository = new StubFamilyMemoryRepository([
      familyFact({
        id: "fact-unrelated",
        category: "preference",
        body: "Sofia likes pasta for lunch."
      }),
      familyFact({
        id: "fact-match",
        category: "preference",
        body: "Max prefers chamomile tea before sleep."
      })
    ]);
    const useCase = new RecallFamilyFactsUseCase({
      repository,
      recentLimit: 10
    });

    await expect(
      useCase.execute({
        query: "what tea does Max like before bed?"
      })
    ).resolves.toEqual({
      text: "Saved family facts:\n- Max prefers chamomile tea before sleep."
    });
  });

  it("matches structured facts when the query uses a subject alias", async () => {
    const repository = new StubFamilyMemoryRepository([
      familyFact({
        id: "fact-unrelated",
        category: "preference",
        body: "Sofia has a blue backpack.",
        subjectId: "sofia"
      }),
      familyFact({
        id: "fact-match",
        category: "preference",
        body: "Favorite hoodie is green.",
        subjectId: "max"
      })
    ]);
    const useCase = new RecallFamilyFactsUseCase({
      repository,
      subjectAliases: new StubSubjectAliasRepository({
        maksim: "max"
      }),
      recentLimit: 10
    });

    await expect(
      useCase.execute({
        query: "what about Maksim?"
      })
    ).resolves.toEqual({
      text: "Saved family facts:\n- Favorite hoodie is green."
    });
  });

  it("uses model semantic selection and synthesis when configured", async () => {
    const repository = new StubFamilyMemoryRepository([
      familyFact({
        id: "fact-unrelated",
        category: "event",
        body: "Sofia started piano lessons."
      }),
      familyFact({
        id: "fact-match",
        category: "preference",
        body: "Max prefers chamomile tea before sleep."
      })
    ]);
    const model = new QueueModel([
      JSON.stringify({
        factIds: ["fact-match", "fact-missing"]
      }),
      JSON.stringify({
        answer: "Max prefers chamomile tea before sleep.",
        usedMemoryItemIds: ["fact-match"]
      })
    ]);
    const useCase = new RecallFamilyFactsUseCase({
      repository,
      recentLimit: 10,
      model
    });

    await expect(
      useCase.execute({
        query: "what helps Max settle at bedtime?"
      })
    ).resolves.toEqual({
      text: "Max prefers chamomile tea before sleep."
    });
    expect(model.requests.map((request) => request.purpose)).toEqual([
      "Select relevant DozerClaw family memories",
      "Synthesize DozerClaw family memory answer"
    ]);
    expect(model.requests[0]?.input).toContain("fact-match");
    expect(model.requests[1]?.input).toContain(
      "Max prefers chamomile tea before sleep."
    );
    expect(model.requests[1]?.input).not.toContain("Sofia started piano lessons.");
  });

  it("rejects synthesized answers that cite memories outside selected context", async () => {
    const repository = new StubFamilyMemoryRepository([
      familyFact({
        id: "fact-match",
        category: "preference",
        body: "Max prefers chamomile tea before sleep."
      })
    ]);
    const model = new QueueModel([
      JSON.stringify({
        memoryItemIds: ["fact-match"]
      }),
      JSON.stringify({
        answer: "Max prefers chamomile tea and also likes mint.",
        usedMemoryItemIds: ["fact-match", "fact-missing"]
      })
    ]);
    const useCase = new RecallFamilyFactsUseCase({
      repository,
      recentLimit: 10,
      model
    });

    await expect(
      useCase.execute({
        query: "what helps Max sleep?"
      })
    ).resolves.toEqual({
      text: "Saved family facts:\n- Max prefers chamomile tea before sleep."
    });
    expect(model.requests[1]?.outputSchema).toMatchObject({
      name: "dozerclaw_family_memory_synthesis"
    });
  });

  it("lets model selection choose semantic memory results for synthesis", async () => {
    const model = new QueueModel([
      JSON.stringify({
        memoryItemIds: ["drawer-tea"]
      }),
      JSON.stringify({
        answer: "Max prefers chamomile tea before sleep.",
        usedMemoryItemIds: ["drawer-tea"]
      })
    ]);
    const useCase = new RecallFamilyFactsUseCase({
      repository: new StubFamilyMemoryRepository([]),
      semanticMemory: new StubSemanticMemory([
        {
          entry: {
            id: "drawer-tea",
            body: "Family fact: Max prefers chamomile tea before sleep."
          },
          score: 0.2
        },
        {
          entry: {
            id: "drawer-piano",
            body: "Family fact: Sofia started piano lessons."
          },
          score: 0.4
        }
      ]),
      recentLimit: 10,
      semanticLimit: 5,
      model
    });

    await expect(
      useCase.execute({
        query: "what helps Max sleep?"
      })
    ).resolves.toEqual({
      text: "Max prefers chamomile tea before sleep."
    });
    expect(model.requests.map((request) => request.purpose)).toEqual([
      "Select relevant DozerClaw family memories",
      "Synthesize DozerClaw family memory answer"
    ]);
    expect(model.requests[0]?.input).toContain("drawer-tea");
    expect(model.requests[0]?.input).toContain("drawer-piano");
    expect(model.requests[1]?.input).toContain(
      "Family fact: Max prefers chamomile tea before sleep."
    );
    expect(model.requests[1]?.input).not.toContain(
      "Family fact: Sofia started piano lessons."
    );
  });

  it("reports recall pipeline diagnostics", async () => {
    const model = new QueueModel([
      JSON.stringify({
        memoryItemIds: ["drawer-tea"]
      }),
      JSON.stringify({
        answer: "Max prefers chamomile tea before sleep.",
        usedMemoryItemIds: ["drawer-tea"]
      })
    ]);
    const useCase = new RecallFamilyFactsUseCase({
      repository: new StubFamilyMemoryRepository([
        familyFact({
          id: "fact-local",
          category: "preference",
          body: "Max prefers chamomile tea before sleep."
        })
      ]),
      semanticMemory: new StubSemanticMemory([
        {
          entry: {
            id: "drawer-tea",
            body: "Family fact: Max prefers chamomile tea before sleep."
          },
          score: 0.2
        }
      ]),
      recentLimit: 10,
      semanticLimit: 5,
      model
    });

    await expect(
      useCase.execute({
        query: "what helps Max sleep?",
        includeDiagnostics: true
      })
    ).resolves.toEqual({
      text: "Max prefers chamomile tea before sleep.",
      diagnostics: [
        "recall.local_candidates=1",
        "recall.semantic_candidates=1",
        "recall.selected_ids=drawer-tea",
        "recall.synthesis=accepted"
      ]
    });
  });

  it("falls back to deterministic bullets when model recall fails", async () => {
    const repository = new StubFamilyMemoryRepository([
      familyFact({
        id: "fact-match",
        category: "preference",
        body: "Max prefers chamomile tea before sleep."
      })
    ]);
    const useCase = new RecallFamilyFactsUseCase({
      repository,
      recentLimit: 10,
      model: new ThrowingModel()
    });

    await expect(
      useCase.execute({
        query: "what tea does Max like?"
      })
    ).resolves.toEqual({
      text: "Saved family facts:\n- Max prefers chamomile tea before sleep."
    });
  });

  it("includes semantic memory search results in recall output", async () => {
    const useCase = new RecallFamilyFactsUseCase({
      repository: new StubFamilyMemoryRepository([]),
      semanticMemory: new StubSemanticMemory([
        {
          entry: {
            id: "drawer-1",
            body: "Family fact: Max prefers chamomile tea before sleep."
          },
          score: 0.2
        }
      ]),
      recentLimit: 10,
      semanticLimit: 5
    });

    await expect(
      useCase.execute({
        query: "what helps Max sleep?"
      })
    ).resolves.toEqual({
      text: "Saved family facts:\n- Family fact: Max prefers chamomile tea before sleep."
    });
  });

  it("falls back to local facts when semantic memory search fails", async () => {
    const useCase = new RecallFamilyFactsUseCase({
      repository: new StubFamilyMemoryRepository([
        familyFact({
          id: "fact-match",
          category: "preference",
          body: "Max prefers chamomile tea before sleep."
        })
      ]),
      semanticMemory: new ThrowingSemanticMemory(),
      recentLimit: 10
    });

    await expect(
      useCase.execute({
        query: "what tea does Max like?"
      })
    ).resolves.toEqual({
      text: "Saved family facts:\n- Max prefers chamomile tea before sleep."
    });
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

class QueueModel implements ModelPort {
  readonly requests: ModelTextRequest[] = [];

  constructor(private readonly texts: string[]) {}

  async runTextRequest(request: ModelTextRequest) {
    this.requests.push(request);
    const text = this.texts.shift();

    if (!text) {
      throw new Error("no queued model response");
    }

    return { text };
  }
}

class ThrowingModel implements ModelPort {
  async runTextRequest(): Promise<ModelTextResponse> {
    throw new Error("model unavailable");
  }
}

class StubSemanticMemory implements MemoryPort {
  seenQuery: MemorySearchQuery | undefined;

  constructor(private readonly results: readonly MemorySearchResult[]) {}

  async store(input: MemoryEntryInput) {
    return {
      id: "drawer-1",
      body: input.body
    };
  }

  async search(query: MemorySearchQuery) {
    this.seenQuery = query;

    return this.results;
  }
}

class ThrowingSemanticMemory extends StubSemanticMemory {
  constructor() {
    super([]);
  }

  async search(): Promise<never> {
    throw new Error("semantic memory unavailable");
  }
}

class StubSubjectAliasRepository implements SubjectAliasRepositoryPort {
  constructor(private readonly aliases: Record<string, string>) {}

  async resolveCanonicalSubjectId(subjectId: string): Promise<string> {
    return this.aliases[subjectId] ?? subjectId;
  }

  async saveSubjectAlias(): Promise<void> {}

  async listSubjectAliases() {
    return [];
  }

  async deleteSubjectAlias(): Promise<boolean> {
    return false;
  }
}

function familyFact(
  input: Pick<FamilyFact, "id" | "category" | "body"> &
    Partial<Pick<FamilyFact, "subjectId">>
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
