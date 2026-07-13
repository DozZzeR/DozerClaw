import type { FamilyFact } from "../../../core/domain/family-memory/family-fact.js";
import type { FamilyMemoryRepositoryPort } from "../../../ports/family-memory-repository-port.js";
import type { MemoryPort, MemorySearchResult } from "../../../ports/memory-port.js";
import type { ModelPort } from "../../../ports/model-port.js";

export interface RecallFamilyFactsDependencies {
  readonly repository: FamilyMemoryRepositoryPort;
  readonly semanticMemory?: MemoryPort;
  readonly recentLimit: number;
  readonly resultLimit?: number;
  readonly semanticLimit?: number;
  readonly model?: ModelPort;
}

export interface RecallFamilyFactsInput {
  readonly query: string;
  readonly includeDiagnostics?: boolean;
}

export interface RecallFamilyFactsResult {
  readonly text: string;
  readonly diagnostics?: readonly string[];
}

export class RecallFamilyFactsUseCase {
  constructor(private readonly dependencies: RecallFamilyFactsDependencies) {}

  async execute(input: RecallFamilyFactsInput): Promise<RecallFamilyFactsResult> {
    const facts = await this.dependencies.repository.listRecentActiveFamilyFacts(
      this.dependencies.recentLimit
    );
    const semanticResults = await this.searchSemanticMemory(input.query);
    const includeDiagnostics = input.includeDiagnostics === true;
    const diagnostics = [
      `recall.local_candidates=${facts.length}`,
      `recall.semantic_candidates=${semanticResults.length}`
    ];

    if (facts.length === 0 && semanticResults.length === 0) {
      return withDiagnostics(
        {
          text: "I do not have any saved family facts yet."
        },
        includeDiagnostics,
        [
          ...diagnostics,
          "recall.selected_ids=",
          "recall.synthesis=unavailable"
        ]
      );
    }

    const selectedItems = await this.selectItems(
      input.query,
      facts,
      semanticResults
    );
    diagnostics.push(
      `recall.selected_ids=${selectedItems.map((item) => item.id).join(",")}`
    );
    const synthesized = await this.synthesizeAnswer(input.query, selectedItems);
    diagnostics.push(`recall.synthesis=${synthesized.status}`);

    if (synthesized.answer) {
      return withDiagnostics(
        { text: synthesized.answer },
        includeDiagnostics,
        diagnostics
      );
    }

    return withDiagnostics(
      { text: formatMemoryBullets(selectedItems) },
      includeDiagnostics,
      diagnostics
    );
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

  private async selectItems(
    query: string,
    facts: readonly FamilyFact[],
    semanticResults: readonly MemorySearchResult[]
  ): Promise<readonly RecallMemoryItem[]> {
    const rankedFacts = rankFacts(query, facts);
    const deterministicFacts = matchingFacts(rankedFacts);
    const fallbackItems = [
      ...limitFacts(
        deterministicFacts.length > 0
          ? deterministicFacts
          : rankedFacts.map((item) => item.fact),
        this.resultLimit()
      ).map(toLocalMemoryItem),
      ...semanticResults.map(toSemanticMemoryItem)
    ];

    if (!this.dependencies.model) {
      return fallbackItems;
    }

    const candidateItems = [
      ...rankedFacts.map((item) => toLocalMemoryItem(item.fact)),
      ...semanticResults.map(toSemanticMemoryItem)
    ];

    if (candidateItems.length === 0) {
      return fallbackItems;
    }

    try {
      const response = await this.dependencies.model.runTextRequest({
        purpose: "Select relevant DozerClaw family memories",
        input: buildSelectionPrompt(query, candidateItems),
        outputSchema: {
          name: "dozerclaw_family_memory_selection",
          schema: memorySelectionSchema
        }
      });
      const selectedIds = parseSelectedMemoryItemIds(response.text);
      const selectedItems = selectedIds
        .map((id) => candidateItems.find((item) => item.id === id))
        .filter((item): item is RecallMemoryItem => Boolean(item));

      if (selectedItems.length > 0) {
        return limitItems(selectedItems, this.resultLimit());
      }
    } catch {
      return fallbackItems;
    }

    return fallbackItems;
  }

  private async synthesizeAnswer(
    query: string,
    items: readonly RecallMemoryItem[]
  ): Promise<SynthesisResult> {
    if (!this.dependencies.model) {
      return {
        status: "unavailable"
      };
    }

    try {
      const response = await this.dependencies.model.runTextRequest({
        purpose: "Synthesize DozerClaw family memory answer",
        input: buildSynthesisPrompt(query, items),
        outputSchema: {
          name: "dozerclaw_family_memory_synthesis",
          schema: synthesisSchema
        }
      });
      const parsed = parseSynthesizedAnswer(response.text);

      if (!parsed || !isGroundedSynthesis(parsed, items)) {
        return {
          status: "rejected"
        };
      }

      return {
        status: "accepted",
        answer: parsed.answer
      };
    } catch {
      return {
        status: "failed"
      };
    }
  }

  private resultLimit(): number {
    return this.dependencies.resultLimit ?? this.dependencies.recentLimit;
  }
}

interface RecallMemoryItem {
  readonly id: string;
  readonly source: "structured_fact" | "semantic_memory";
  readonly body: string;
  readonly category?: FamilyFact["category"];
  readonly subjectId?: string;
  readonly sourceMessageText?: string;
  readonly createdAt?: Date;
}

interface SynthesisResult {
  readonly status: "accepted" | "rejected" | "unavailable" | "failed";
  readonly answer?: string;
}

function withDiagnostics(
  result: Pick<RecallFamilyFactsResult, "text">,
  includeDiagnostics: boolean,
  diagnostics: readonly string[]
): RecallFamilyFactsResult {
  if (!includeDiagnostics) {
    return result;
  }

  return {
    ...result,
    diagnostics
  };
}

interface RankedFact {
  readonly fact: FamilyFact;
  readonly score: number;
  readonly index: number;
}

function rankFacts(
  query: string,
  facts: readonly FamilyFact[]
): readonly RankedFact[] {
  const tokens = queryTokens(query);
  const categoryHints = hintedCategories(tokens);

  return facts
    .map((fact, index) => ({
      fact,
      index,
      score: scoreFact(fact, tokens, categoryHints)
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
}

function matchingFacts(rankedFacts: readonly RankedFact[]): readonly FamilyFact[] {
  const maxScore = rankedFacts[0]?.score ?? 0;

  if (maxScore === 0) {
    return [];
  }

  const minimumScore = maxScore > 2 ? Math.ceil(maxScore / 2) : 1;

  return rankedFacts
    .filter((rankedFact) => rankedFact.score >= minimumScore)
    .map((rankedFact) => rankedFact.fact);
}

function scoreFact(
  fact: FamilyFact,
  tokens: readonly string[],
  categoryHints: ReadonlySet<FamilyFact["category"]>
): number {
  const searchableText = normalizeText(
    [
      fact.body,
      fact.sourceMessageText,
      fact.subjectId ?? "",
      fact.category
    ].join(" ")
  );
  const searchableTokens = new Set(searchableText.split(/\s+/));
  const subjectText = normalizeText(fact.subjectId ?? "");
  const tokenScore = tokens.reduce((score, token) => {
    if (!searchableTokens.has(token)) {
      return score;
    }

    return score + (subjectText.includes(token) ? 3 : 1);
  }, 0);
  const categoryScore = categoryHints.has(fact.category) ? 2 : 0;

  return tokenScore + categoryScore;
}

function queryTokens(query: string): readonly string[] {
  const seen = new Set<string>();

  return normalizeText(query)
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

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9а-яё]+/giu, " ").trim();
}

function hintedCategories(
  tokens: readonly string[]
): ReadonlySet<FamilyFact["category"]> {
  const categories = new Set<FamilyFact["category"]>();

  if (tokens.some((token) => preferenceHints.has(token))) {
    categories.add("preference");
  }

  if (tokens.some((token) => eventHints.has(token))) {
    categories.add("event");
  }

  if (tokens.some((token) => placeHints.has(token))) {
    categories.add("place");
  }

  if (tokens.some((token) => referenceLinkHints.has(token))) {
    categories.add("reference_link");
  }

  return categories;
}

function limitFacts(
  facts: readonly FamilyFact[],
  limit: number
): readonly FamilyFact[] {
  return facts.slice(0, limit);
}

function limitItems(
  items: readonly RecallMemoryItem[],
  limit: number
): readonly RecallMemoryItem[] {
  return items.slice(0, limit);
}

function toLocalMemoryItem(fact: FamilyFact): RecallMemoryItem {
  return {
    id: fact.id,
    source: "structured_fact",
    body: fact.body,
    category: fact.category,
    ...(fact.subjectId ? { subjectId: fact.subjectId } : {}),
    sourceMessageText: fact.sourceMessageText,
    createdAt: fact.createdAt
  };
}

function toSemanticMemoryItem(result: MemorySearchResult): RecallMemoryItem {
  return {
    id: result.entry.id,
    source: "semantic_memory",
    body: result.entry.body
  };
}

function formatMemoryBullets(items: readonly RecallMemoryItem[]): string {
  return ["Saved family facts:", ...items.map((item) => `- ${item.body}`)].join(
    "\n"
  );
}

function buildSelectionPrompt(
  query: string,
  items: readonly RecallMemoryItem[]
): string {
  return [
    "Select the family memories that are relevant to the user query.",
    "Return only memory item IDs from the provided list.",
    "",
    "# User query",
    query,
    "",
    "# Candidate memory items",
    JSON.stringify(
      items.map((item) => ({
        id: item.id,
        source: item.source,
        ...(item.category ? { category: item.category } : {}),
        ...(item.subjectId ? { subjectId: item.subjectId } : {}),
        body: item.body,
        ...(item.sourceMessageText
          ? { sourceMessageText: item.sourceMessageText }
          : {}),
        ...(item.createdAt ? { createdAt: item.createdAt.toISOString() } : {})
      }))
    )
  ].join("\n");
}

function buildSynthesisPrompt(
  query: string,
  items: readonly RecallMemoryItem[]
): string {
  return [
    "Answer the user query using only the provided family facts.",
    "If the facts do not fully answer the query, say what is known and do not invent details.",
    "",
    "# User query",
    query,
    "",
    "# Family memory context",
    JSON.stringify(
      items.map((item) => ({
        id: item.id,
        source: item.source,
        ...(item.category ? { category: item.category } : {}),
        body: item.body
      }))
    )
  ].join("\n");
}

function parseSelectedMemoryItemIds(text: string): readonly string[] {
  try {
    const parsed = JSON.parse(text) as unknown;

    if (!isRecord(parsed)) {
      return [];
    }

    if (Array.isArray(parsed.memoryItemIds)) {
      return parsed.memoryItemIds.filter(
        (id): id is string => typeof id === "string"
      );
    }

    if (Array.isArray(parsed.factIds)) {
      return parsed.factIds.filter((id): id is string => typeof id === "string");
    }

    return [];
  } catch {
    return [];
  }
}

interface ParsedSynthesizedAnswer {
  readonly answer: string;
  readonly usedMemoryItemIds: readonly string[];
}

function parseSynthesizedAnswer(text: string): ParsedSynthesizedAnswer | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;

    if (
      !isRecord(parsed) ||
      typeof parsed.answer !== "string" ||
      !Array.isArray(parsed.usedMemoryItemIds)
    ) {
      return undefined;
    }

    const answer = parsed.answer.trim();
    const usedMemoryItemIds = parsed.usedMemoryItemIds.filter(
      (id): id is string => typeof id === "string"
    );

    if (!answer) {
      return undefined;
    }

    return {
      answer,
      usedMemoryItemIds
    };
  } catch {
    return undefined;
  }
}

function isGroundedSynthesis(
  parsed: ParsedSynthesizedAnswer,
  items: readonly RecallMemoryItem[]
): boolean {
  if (parsed.usedMemoryItemIds.length === 0) {
    return false;
  }

  const itemIds = new Set(items.map((item) => item.id));

  return parsed.usedMemoryItemIds.every((id) => itemIds.has(id));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const memorySelectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    memoryItemIds: {
      type: "array",
      items: {
        type: "string"
      }
    }
  },
  required: ["memoryItemIds"]
};

const synthesisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: {
      type: "string"
    },
    usedMemoryItemIds: {
      type: "array",
      items: {
        type: "string"
      },
      minItems: 1
    }
  },
  required: ["answer", "usedMemoryItemIds"]
};

const stopWords = new Set([
  "about",
  "what",
  "does",
  "remember",
  "family",
  "fact",
  "facts",
  "tell",
  "please",
  "что",
  "про",
  "как",
  "мне",
  "помнишь",
  "помнит"
]);

const preferenceHints = new Set([
  "prefer",
  "prefers",
  "preference",
  "like",
  "likes",
  "love",
  "loves",
  "любить",
  "любит",
  "нравится"
]);

const eventHints = new Set([
  "event",
  "when",
  "started",
  "start",
  "lesson",
  "lessons",
  "событие",
  "когда",
  "начал",
  "начала"
]);

const placeHints = new Set([
  "place",
  "where",
  "address",
  "location",
  "место",
  "где",
  "адрес"
]);

const referenceLinkHints = new Set([
  "link",
  "url",
  "site",
  "reference",
  "ссылка",
  "сайт"
]);
