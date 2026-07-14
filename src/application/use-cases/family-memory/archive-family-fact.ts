import type { FamilyFact } from "../../../core/domain/family-memory/family-fact.js";
import type { FamilyMemoryRepositoryPort } from "../../../ports/family-memory-repository-port.js";

export interface ArchiveFamilyFactDependencies {
  readonly repository: FamilyMemoryRepositoryPort;
  readonly now: () => Date;
  readonly recentLimit: number;
}

export interface ArchiveFamilyFactInput {
  readonly query: string;
}

export type ArchiveFamilyFactResult =
  | {
      readonly status: "archived";
      readonly fact: FamilyFact;
    }
  | {
      readonly status: "not_found";
    }
  | {
      readonly status: "ambiguous";
      readonly candidates: readonly FamilyFact[];
    };

export class ArchiveFamilyFactUseCase {
  constructor(private readonly dependencies: ArchiveFamilyFactDependencies) {}

  async execute(
    input: ArchiveFamilyFactInput
  ): Promise<ArchiveFamilyFactResult> {
    const queryTokens = meaningfulTokens(input.query);

    if (queryTokens.length === 0) {
      return {
        status: "not_found"
      };
    }

    const facts = await this.dependencies.repository.listRecentActiveFamilyFacts(
      this.dependencies.recentLimit
    );
    const rankedFacts = facts
      .map((fact, index) => ({
        fact,
        index,
        score: scoreFact(fact, queryTokens)
      }))
      .filter((rankedFact) => rankedFact.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const topScore = rankedFacts[0]?.score ?? 0;
    const candidates = rankedFacts
      .filter((rankedFact) => rankedFact.score === topScore)
      .map((rankedFact) => rankedFact.fact);

    if (candidates.length === 0) {
      return {
        status: "not_found"
      };
    }

    if (candidates.length > 1) {
      return {
        status: "ambiguous",
        candidates
      };
    }

    const candidate = candidates[0]!;
    const archivedFact: FamilyFact = {
      ...candidate,
      status: "archived",
      updatedAt: this.dependencies.now()
    };

    await this.dependencies.repository.saveFamilyFact(archivedFact);

    return {
      status: "archived",
      fact: archivedFact
    };
  }
}

function scoreFact(fact: FamilyFact, queryTokens: readonly string[]): number {
  const searchableTokens = new Set(
    meaningfulTokens(
      [
        fact.body,
        fact.sourceMessageText,
        fact.subjectId ?? "",
        fact.category
      ].join(" ")
    )
  );

  return queryTokens.reduce(
    (score, token) => score + (searchableTokens.has(token) ? 1 : 0),
    0
  );
}

function meaningfulTokens(text: string): readonly string[] {
  const seen = new Set<string>();

  return text
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/giu, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stopWords.has(token))
    .filter((token) => {
      if (seen.has(token)) {
        return false;
      }

      seen.add(token);

      return true;
    });
}

const stopWords = new Set([
  "the",
  "and",
  "for",
  "that",
  "this",
  "before",
  "after",
  "forget",
  "remove",
  "delete",
  "archive",
  "про",
  "что",
  "как",
  "это",
  "для",
  "забудь",
  "удали",
  "убери",
  "архив"
]);
