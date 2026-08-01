import type { FamilyJournalEntry } from "../../../core/domain/family-journal/family-journal-entry.js";
import { normalizeSubjectId } from "../../../core/domain/family-memory/subject-id.js";
import type { FamilyJournalRepositoryPort } from "../../../ports/family-journal-repository-port.js";
import type { MemoryPort, MemorySearchResult } from "../../../ports/memory-port.js";
import type { SubjectAliasRepositoryPort } from "../../../ports/subject-alias-repository-port.js";

export interface RecallFamilyJournalEntriesDependencies {
  readonly repository: FamilyJournalRepositoryPort;
  readonly semanticMemory?: MemoryPort;
  readonly subjectAliases?: SubjectAliasRepositoryPort;
  readonly recentLimit: number;
  readonly resultLimit?: number;
  readonly semanticLimit?: number;
}

export interface RecallFamilyJournalEntriesInput {
  readonly query: string;
}

export interface RecallFamilyJournalEntriesResult {
  readonly text: string;
}

export class RecallFamilyJournalEntriesUseCase {
  constructor(
    private readonly dependencies: RecallFamilyJournalEntriesDependencies
  ) {}

  async execute(
    input: RecallFamilyJournalEntriesInput
  ): Promise<RecallFamilyJournalEntriesResult> {
    const entries =
      await this.dependencies.repository.listRecentActiveFamilyJournalEntries(
        this.dependencies.recentLimit
      );
    const semanticResults = await this.searchSemanticMemory(input.query);

    if (entries.length === 0 && semanticResults.length === 0) {
      return {
        text: "I do not have any saved family journal entries yet."
      };
    }

    const rankedEntries = await this.rankEntries(input.query, entries);
    const matchingEntries = rankedEntries
      .filter((entry) => entry.score > 0)
      .map((entry) => entry.entry);
    const selectedEntries = limit(
      matchingEntries.length > 0 ? matchingEntries : entries,
      this.resultLimit()
    );

    if (selectedEntries.length > 0) {
      return {
        text: formatJournalEntries(selectedEntries)
      };
    }

    if (semanticResults.length > 0) {
      return {
        text: formatSemanticResults(semanticResults, this.resultLimit())
      };
    }

    return {
      text: "No matching family journal entries found."
    };
  }

  private async searchSemanticMemory(
    query: string
  ): Promise<readonly MemorySearchResult[]> {
    if (!this.dependencies.semanticMemory) {
      return [];
    }

    try {
      return await this.dependencies.semanticMemory.search({
        text: query,
        limit: this.dependencies.semanticLimit ?? this.resultLimit()
      });
    } catch {
      return [];
    }
  }

  private async rankEntries(
    query: string,
    entries: readonly FamilyJournalEntry[]
  ): Promise<readonly RankedFamilyJournalEntry[]> {
    const queryTokens = await this.queryTokens(query);

    return entries
      .map((entry) => ({
        entry,
        score: scoreEntry(queryTokens, entry)
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.entry.occurredAt.getTime() - left.entry.occurredAt.getTime()
      );
  }

  private async queryTokens(query: string): Promise<ReadonlySet<string>> {
    const tokens = new Set(meaningfulTokens(query));

    for (const token of [...tokens]) {
      const normalizedSubjectId = normalizeSubjectId(token);

      if (!normalizedSubjectId) {
        continue;
      }

      tokens.add(normalizedSubjectId);

      const canonicalSubjectId =
        await this.dependencies.subjectAliases?.resolveCanonicalSubjectId(
          normalizedSubjectId
        );

      if (canonicalSubjectId) {
        tokens.add(canonicalSubjectId);
      }
    }

    return tokens;
  }

  private resultLimit(): number {
    return this.dependencies.resultLimit ?? 5;
  }
}

interface RankedFamilyJournalEntry {
  readonly entry: FamilyJournalEntry;
  readonly score: number;
}

function scoreEntry(
  queryTokens: ReadonlySet<string>,
  entry: FamilyJournalEntry
): number {
  const searchable = [
    entry.category,
    entry.body,
    ...(entry.subjectId ? [entry.subjectId] : [])
  ].join(" ");
  const entryTokens = new Set(meaningfulTokens(searchable));
  let score = 0;

  for (const token of queryTokens) {
    if (entryTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

function formatJournalEntries(entries: readonly FamilyJournalEntry[]): string {
  return [
    "Recent family journal entries:",
    ...entries.map((entry) => {
      const subject = entry.subjectId ? ` (subject: ${entry.subjectId})` : "";

      return `- [${entry.category}] ${entry.body}${subject}`;
    })
  ].join("\n");
}

function formatSemanticResults(
  results: readonly MemorySearchResult[],
  resultLimit: number
): string {
  return [
    "Recent family journal entries:",
    ...limit(results, resultLimit).map((result) => `- ${result.entry.body}`)
  ].join("\n");
}

function limit<T>(items: readonly T[], count: number): readonly T[] {
  return items.slice(0, Math.max(0, count));
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
