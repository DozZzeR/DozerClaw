import type { FamilyFact } from "../../../core/domain/family-memory/family-fact.js";
import type { FamilyFactCategory } from "../../../core/domain/family-memory/family-fact.js";
import { normalizeSubjectId } from "../../../core/domain/family-memory/subject-id.js";
import type { FamilyMemoryRepositoryPort } from "../../../ports/family-memory-repository-port.js";
import type { MemoryPort } from "../../../ports/memory-port.js";
import type { SubjectAliasRepositoryPort } from "../../../ports/subject-alias-repository-port.js";

export interface RecordFamilyFactDependencies {
  readonly repository: FamilyMemoryRepositoryPort;
  readonly semanticMemory?: MemoryPort;
  readonly subjectAliases?: SubjectAliasRepositoryPort;
  readonly generateId: () => string;
  readonly now: () => Date;
  readonly confirmationCandidateLimit?: number;
}

export interface RecordFamilyFactInput {
  readonly summary: string;
  readonly category?: FamilyFactCategory;
  readonly subjectId?: string;
  readonly sourceActorId: string;
  readonly sourceChatId: string;
  readonly sourceMessageText: string;
}

export type RecordFamilyFactResult =
  | {
      readonly status: "created";
      readonly fact: FamilyFact;
    }
  | {
      readonly status: "needs_confirmation";
      readonly newFact: FamilyFact;
      readonly candidates: readonly FamilyFact[];
    };

export class RecordFamilyFactUseCase {
  constructor(private readonly dependencies: RecordFamilyFactDependencies) {}

  async execute(input: RecordFamilyFactInput): Promise<RecordFamilyFactResult> {
    const now = this.dependencies.now();
    const subjectId = await this.resolveSubjectId(input.subjectId);
    const fact: FamilyFact = {
      id: this.dependencies.generateId(),
      category: input.category ?? "preference",
      body: input.summary.trim(),
      ...(subjectId ? { subjectId } : {}),
      sourceActorId: input.sourceActorId,
      sourceChatId: input.sourceChatId,
      sourceMessageText: input.sourceMessageText,
      status: "active",
      createdAt: now,
      updatedAt: now
    };
    const candidates = await this.findRelatedFacts(fact);

    if (candidates.length > 0) {
      return {
        status: "needs_confirmation",
        newFact: fact,
        candidates
      };
    }

    await this.dependencies.repository.saveFamilyFact(fact);
    const savedFact = await this.storeSemanticSummary(fact);

    return {
      status: "created",
      fact: savedFact
    };
  }

  private async findRelatedFacts(
    fact: FamilyFact
  ): Promise<readonly FamilyFact[]> {
    const facts = await this.dependencies.repository.listRecentActiveFamilyFacts(
      this.dependencies.confirmationCandidateLimit ?? 20
    );

    return facts.filter((candidate) => areRelatedFacts(fact, candidate));
  }

  private async storeSemanticSummary(fact: FamilyFact): Promise<FamilyFact> {
    if (!this.dependencies.semanticMemory) {
      return fact;
    }

    try {
      const entry = await this.dependencies.semanticMemory.store({
        body: `Family fact: ${fact.body}`,
        references: [`family_fact:${fact.id}`]
      });
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

  private async resolveSubjectId(
    subjectId: string | undefined
  ): Promise<string | undefined> {
    const normalizedSubjectId = normalizeSubjectId(subjectId);

    if (!normalizedSubjectId || !this.dependencies.subjectAliases) {
      return normalizedSubjectId;
    }

    return this.dependencies.subjectAliases.resolveCanonicalSubjectId(
      normalizedSubjectId
    );
  }
}

function areRelatedFacts(left: FamilyFact, right: FamilyFact): boolean {
  if (left.category !== right.category) {
    return false;
  }

  if (left.subjectId && right.subjectId && left.subjectId !== right.subjectId) {
    return false;
  }

  const leftTokens = meaningfulTokens(left.body);
  const rightTokens = new Set(meaningfulTokens(right.body));
  const overlap = leftTokens.filter((token) => rightTokens.has(token)).length;

  if (left.subjectId && right.subjectId && left.subjectId === right.subjectId) {
    return overlap >= 1;
  }

  return overlap >= 3;
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
  "про",
  "что",
  "как",
  "это",
  "для"
]);
