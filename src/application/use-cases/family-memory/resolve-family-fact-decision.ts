import type { FamilyFact } from "../../../core/domain/family-memory/family-fact.js";
import type { FamilyMemoryRepositoryPort } from "../../../ports/family-memory-repository-port.js";
import type { MemoryPort } from "../../../ports/memory-port.js";
import type { PendingFamilyFactDecision } from "../../../ports/state-repository-port.js";

export type FamilyFactDecision = "update" | "create" | "cancel";

export interface ResolveFamilyFactDecisionDependencies {
  readonly repository: FamilyMemoryRepositoryPort;
  readonly semanticMemory?: MemoryPort;
  readonly now: () => Date;
}

export interface ResolveFamilyFactDecisionInput {
  readonly decision: FamilyFactDecision;
  readonly candidateIndex?: number;
  readonly pending: PendingFamilyFactDecision;
}

export type ResolveFamilyFactDecisionResult =
  | {
      readonly status: "updated";
      readonly fact: FamilyFact;
    }
  | {
      readonly status: "created";
      readonly fact: FamilyFact;
    }
  | {
      readonly status: "cancelled";
    };

export class ResolveFamilyFactDecisionUseCase {
  constructor(
    private readonly dependencies: ResolveFamilyFactDecisionDependencies
  ) {}

  async execute(
    input: ResolveFamilyFactDecisionInput
  ): Promise<ResolveFamilyFactDecisionResult> {
    if (input.decision === "cancel") {
      return {
        status: "cancelled"
      };
    }

    if (input.decision === "create") {
      await this.dependencies.repository.saveFamilyFact(input.pending.newFact);
      const savedFact = await this.storeSemanticSummary(input.pending.newFact);

      return {
        status: "created",
        fact: savedFact
      };
    }

    const candidate =
      input.pending.candidates[input.candidateIndex ?? 0] ??
      input.pending.candidates[0];

    if (!candidate) {
      await this.dependencies.repository.saveFamilyFact(input.pending.newFact);
      const savedFact = await this.storeSemanticSummary(input.pending.newFact);

      return {
        status: "created",
        fact: savedFact
      };
    }

    const updatedFact: FamilyFact = {
      ...input.pending.newFact,
      id: candidate.id,
      ...(candidate.semanticMemoryEntryId
        ? { semanticMemoryEntryId: candidate.semanticMemoryEntryId }
        : {}),
      createdAt: candidate.createdAt,
      updatedAt: this.dependencies.now()
    };

    await this.dependencies.repository.saveFamilyFact(updatedFact);
    const savedFact = await this.replaceSemanticSummary(updatedFact);

    return {
      status: "updated",
      fact: savedFact
    };
  }

  private async storeSemanticSummary(fact: FamilyFact): Promise<FamilyFact> {
    if (!this.dependencies.semanticMemory) {
      return fact;
    }

    try {
      const entry = await this.dependencies.semanticMemory.store(
        semanticSummaryInput(fact)
      );
      const savedFact = {
        ...fact,
        semanticMemoryEntryId: entry.id
      };

      await this.dependencies.repository.saveFamilyFact(savedFact);

      return savedFact;
    } catch {
      return fact;
    }
  }

  private async replaceSemanticSummary(fact: FamilyFact): Promise<FamilyFact> {
    if (!this.dependencies.semanticMemory) {
      return fact;
    }

    try {
      const input = semanticSummaryInput(fact);

      if (fact.semanticMemoryEntryId && this.dependencies.semanticMemory.update) {
        await this.dependencies.semanticMemory.update(
          fact.semanticMemoryEntryId,
          input
        );

        return fact;
      }

      if (this.dependencies.semanticMemory.replace) {
        const entry = await this.dependencies.semanticMemory.replace(input);
        const savedFact = {
          ...fact,
          semanticMemoryEntryId: entry.id
        };

        await this.dependencies.repository.saveFamilyFact(savedFact);

        return savedFact;
      }

      const entry = await this.dependencies.semanticMemory.store(input);
      const savedFact = {
        ...fact,
        semanticMemoryEntryId: entry.id
      };

      await this.dependencies.repository.saveFamilyFact(savedFact);

      return savedFact;
    } catch {
      return fact;
    }
  }
}

function semanticSummaryInput(fact: FamilyFact) {
  return {
    body: `Family fact: ${fact.body}`,
    references: [`family_fact:${fact.id}`]
  };
}
