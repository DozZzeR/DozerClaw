import type { FamilyJournalEntry } from "../../../core/domain/family-journal/family-journal-entry.js";
import { normalizeSubjectId } from "../../../core/domain/family-memory/subject-id.js";
import type { FamilyJournalRepositoryPort } from "../../../ports/family-journal-repository-port.js";
import type { MemoryPort, MemorySearchResult } from "../../../ports/memory-port.js";
import type { ModelPort } from "../../../ports/model-port.js";
import type { SubjectAliasRepositoryPort } from "../../../ports/subject-alias-repository-port.js";

export interface RecallFamilyJournalEntriesDependencies {
  readonly repository: FamilyJournalRepositoryPort;
  readonly semanticMemory?: MemoryPort;
  readonly subjectAliases?: SubjectAliasRepositoryPort;
  readonly recentLimit: number;
  readonly resultLimit?: number;
  readonly semanticLimit?: number;
  readonly model?: ModelPort;
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
    const selectedEntries = limit(matchingEntries, this.resultLimit());

    if (selectedEntries.length > 0) {
      return this.answerFromEntries(input.query, selectedEntries);
    }

    if (semanticResults.length > 0) {
      return {
        text: formatSemanticResults(semanticResults, this.resultLimit())
      };
    }

    const recentEntries = limit(entries, this.resultLimit());

    if (recentEntries.length > 0) {
      return this.answerFromEntries(input.query, recentEntries);
    }

    return {
      text: "No matching family journal entries found."
    };
  }

  private async answerFromEntries(
    query: string,
    entries: readonly FamilyJournalEntry[]
  ): Promise<RecallFamilyJournalEntriesResult> {
    const synthesized = await this.synthesizeAnswer(query, entries);

    if (synthesized) {
      return {
        text: synthesized
      };
    }

    return {
      text: formatJournalEntries(entries)
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

  private async synthesizeAnswer(
    query: string,
    entries: readonly FamilyJournalEntry[]
  ): Promise<string | undefined> {
    if (!this.dependencies.model) {
      return undefined;
    }

    try {
      const response = await this.dependencies.model.runTextRequest({
        purpose: "Synthesize DozerClaw family journal answer",
        input: buildSynthesisPrompt(query, entries),
        outputSchema: {
          name: "dozerclaw_family_journal_synthesis",
          schema: synthesisSchema
        }
      });
      const parsed = parseSynthesizedAnswer(response.text);

      if (!parsed || !isGroundedSynthesis(parsed, entries)) {
        return undefined;
      }

      return parsed.answer;
    } catch {
      return undefined;
    }
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

function buildSynthesisPrompt(
  query: string,
  entries: readonly FamilyJournalEntry[]
): string {
  return [
    "Answer the user query using only the provided family journal entries.",
    "If the entries do not fully answer the query, say what is known and do not invent details.",
    "Do not provide medical advice.",
    "",
    "# User query",
    query,
    "",
    "# Family journal context",
    JSON.stringify(
      entries.map((entry) => ({
        id: entry.id,
        category: entry.category,
        body: entry.body,
        ...(entry.subjectId ? { subjectId: entry.subjectId } : {}),
        occurredAt: entry.occurredAt.toISOString()
      }))
    )
  ].join("\n");
}

interface ParsedSynthesizedAnswer {
  readonly answer: string;
  readonly usedJournalEntryIds: readonly string[];
}

function parseSynthesizedAnswer(
  text: string
): ParsedSynthesizedAnswer | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;

    if (
      !isRecord(parsed) ||
      typeof parsed.answer !== "string" ||
      !Array.isArray(parsed.usedJournalEntryIds)
    ) {
      return undefined;
    }

    const answer = parsed.answer.trim();
    const usedJournalEntryIds = parsed.usedJournalEntryIds.filter(
      (id): id is string => typeof id === "string"
    );

    if (!answer) {
      return undefined;
    }

    return {
      answer,
      usedJournalEntryIds
    };
  } catch {
    return undefined;
  }
}

function isGroundedSynthesis(
  parsed: ParsedSynthesizedAnswer,
  entries: readonly FamilyJournalEntry[]
): boolean {
  if (parsed.usedJournalEntryIds.length === 0) {
    return false;
  }

  const entryIds = new Set(entries.map((entry) => entry.id));

  return parsed.usedJournalEntryIds.every((id) => entryIds.has(id));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const synthesisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: {
      type: "string"
    },
    usedJournalEntryIds: {
      type: "array",
      items: {
        type: "string"
      },
      minItems: 1
    }
  },
  required: ["answer", "usedJournalEntryIds"]
};

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
