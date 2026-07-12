import type { FamilyMemoryRepositoryPort } from "../../../ports/family-memory-repository-port.js";

export interface RecallFamilyFactsDependencies {
  readonly repository: FamilyMemoryRepositoryPort;
  readonly recentLimit: number;
}

export interface RecallFamilyFactsInput {
  readonly query: string;
}

export interface RecallFamilyFactsResult {
  readonly text: string;
}

export class RecallFamilyFactsUseCase {
  constructor(private readonly dependencies: RecallFamilyFactsDependencies) {}

  async execute(_input: RecallFamilyFactsInput): Promise<RecallFamilyFactsResult> {
    const facts = await this.dependencies.repository.listRecentActiveFamilyFacts(
      this.dependencies.recentLimit
    );

    if (facts.length === 0) {
      return {
        text: "I do not have any saved family facts yet."
      };
    }

    return {
      text: ["Saved family facts:", ...facts.map((fact) => `- ${fact.body}`)].join(
        "\n"
      )
    };
  }
}
