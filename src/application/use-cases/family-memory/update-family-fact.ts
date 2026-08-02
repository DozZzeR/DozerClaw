import type { FamilyFact } from "../../../core/domain/family-memory/family-fact.js";
import type { FamilyMemoryRepositoryPort } from "../../../ports/family-memory-repository-port.js";
import type { MemoryPort } from "../../../ports/memory-port.js";

export interface UpdateFamilyFactDependencies {
  readonly repository: FamilyMemoryRepositoryPort;
  readonly semanticMemory?: MemoryPort;
  readonly now: () => Date;
}

export interface UpdateFamilyFactInput {
  readonly factId: string;
  readonly body: string;
}

export type UpdateFamilyFactResult =
  | {
      readonly status: "updated";
      readonly fact: FamilyFact;
    }
  | {
      readonly status: "not_found";
    };

export class UpdateFamilyFactUseCase {
  constructor(private readonly dependencies: UpdateFamilyFactDependencies) {}

  async execute(input: UpdateFamilyFactInput): Promise<UpdateFamilyFactResult> {
    const fact = await this.dependencies.repository.findFamilyFactById?.(
      input.factId
    );

    if (!fact || fact.status !== "active") {
      return {
        status: "not_found"
      };
    }

    const updatedFact: FamilyFact = {
      ...fact,
      body: input.body.trim(),
      updatedAt: this.dependencies.now()
    };

    await this.dependencies.repository.saveFamilyFact(updatedFact);
    const savedFact = await this.updateSemanticSummary(updatedFact);

    return {
      status: "updated",
      fact: savedFact
    };
  }

  private async updateSemanticSummary(fact: FamilyFact): Promise<FamilyFact> {
    if (!this.dependencies.semanticMemory) {
      return fact;
    }

    try {
      const input = {
        body: `Family fact: ${fact.body}`,
        references: [`family_fact:${fact.id}`]
      };

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
