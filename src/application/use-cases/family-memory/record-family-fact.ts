import type { FamilyFact } from "../../../core/domain/family-memory/family-fact.js";
import type { FamilyMemoryRepositoryPort } from "../../../ports/family-memory-repository-port.js";
import type { MemoryPort } from "../../../ports/memory-port.js";

export interface RecordFamilyFactDependencies {
  readonly repository: FamilyMemoryRepositoryPort;
  readonly semanticMemory?: MemoryPort;
  readonly generateId: () => string;
  readonly now: () => Date;
}

export interface RecordFamilyFactInput {
  readonly summary: string;
  readonly sourceActorId: string;
  readonly sourceChatId: string;
  readonly sourceMessageText: string;
}

export class RecordFamilyFactUseCase {
  constructor(private readonly dependencies: RecordFamilyFactDependencies) {}

  async execute(input: RecordFamilyFactInput): Promise<FamilyFact> {
    const now = this.dependencies.now();
    const fact: FamilyFact = {
      id: this.dependencies.generateId(),
      category: "preference",
      body: input.summary.trim(),
      sourceActorId: input.sourceActorId,
      sourceChatId: input.sourceChatId,
      sourceMessageText: input.sourceMessageText,
      status: "active",
      createdAt: now,
      updatedAt: now
    };

    await this.dependencies.repository.saveFamilyFact(fact);
    await this.storeSemanticSummary(fact);

    return fact;
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
}
