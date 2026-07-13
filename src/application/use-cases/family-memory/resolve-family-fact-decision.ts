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
      await this.storeSemanticSummary(input.pending.newFact);

      return {
        status: "created",
        fact: input.pending.newFact
      };
    }

    const candidate =
      input.pending.candidates[input.candidateIndex ?? 0] ??
      input.pending.candidates[0];

    if (!candidate) {
      await this.dependencies.repository.saveFamilyFact(input.pending.newFact);
      await this.storeSemanticSummary(input.pending.newFact);

      return {
        status: "created",
        fact: input.pending.newFact
      };
    }

    const updatedFact: FamilyFact = {
      ...input.pending.newFact,
      id: candidate.id,
      createdAt: candidate.createdAt,
      updatedAt: this.dependencies.now()
    };

    await this.dependencies.repository.saveFamilyFact(updatedFact);
    await this.replaceSemanticSummary(updatedFact);

    return {
      status: "updated",
      fact: updatedFact
    };
  }

  private async storeSemanticSummary(fact: FamilyFact): Promise<void> {
    if (!this.dependencies.semanticMemory) {
      return;
    }

    try {
      await this.dependencies.semanticMemory.store({
        body: `Family fact: ${fact.body}`,
        references: [`family_fact:${fact.id}`]
      });
    } catch {
      return;
    }
  }

  private async replaceSemanticSummary(fact: FamilyFact): Promise<void> {
    if (!this.dependencies.semanticMemory) {
      return;
    }

    try {
      const input = semanticSummaryInput(fact);

      if (this.dependencies.semanticMemory.replace) {
        await this.dependencies.semanticMemory.replace(input);

        return;
      }

      await this.dependencies.semanticMemory.store(input);
    } catch {
      return;
    }
  }
}

function semanticSummaryInput(fact: FamilyFact) {
  return {
    body: `Family fact: ${fact.body}`,
    references: [`family_fact:${fact.id}`]
  };
}
