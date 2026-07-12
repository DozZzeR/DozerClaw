import type { FamilyFact } from "../../../core/domain/family-memory/family-fact.js";
import type { FamilyMemoryRepositoryPort } from "../../../ports/family-memory-repository-port.js";
import type { ModelPort } from "../../../ports/model-port.js";

export interface RecallFamilyFactsDependencies {
  readonly repository: FamilyMemoryRepositoryPort;
  readonly recentLimit: number;
  readonly resultLimit?: number;
  readonly model?: ModelPort;
}

export interface RecallFamilyFactsInput {
  readonly query: string;
}

export interface RecallFamilyFactsResult {
  readonly text: string;
}

export class RecallFamilyFactsUseCase {
  constructor(private readonly dependencies: RecallFamilyFactsDependencies) {}

  async execute(input: RecallFamilyFactsInput): Promise<RecallFamilyFactsResult> {
    const facts = await this.dependencies.repository.listRecentActiveFamilyFacts(
      this.dependencies.recentLimit
    );

    if (facts.length === 0) {
      return {
        text: "I do not have any saved family facts yet."
      };
    }

    const selectedFacts = await this.selectFacts(input.query, facts);
    const synthesized = await this.synthesizeAnswer(input.query, selectedFacts);

    if (synthesized) {
      return {
        text: synthesized
      };
    }

    return {
      text: formatFactBullets(selectedFacts)
    };
  }

  private async selectFacts(
    query: string,
    facts: readonly FamilyFact[]
  ): Promise<readonly FamilyFact[]> {
    const rankedFacts = rankFacts(query, facts);
    const deterministicFacts = matchingFacts(rankedFacts);
    const fallbackFacts = limitFacts(
      deterministicFacts.length > 0 ? deterministicFacts : rankedFacts.map((item) => item.fact),
      this.resultLimit()
    );

    if (!this.dependencies.model) {
      return fallbackFacts;
    }

    try {
      const response = await this.dependencies.model.runTextRequest({
        purpose: "Select relevant DozerClaw family facts",
        input: buildSelectionPrompt(query, rankedFacts.map((item) => item.fact)),
        outputSchema: {
          name: "dozerclaw_family_fact_selection",
          schema: factSelectionSchema
        }
      });
      const selectedIds = parseSelectedFactIds(response.text);
      const selectedFacts = selectedIds
        .map((id) => facts.find((fact) => fact.id === id))
        .filter((fact): fact is FamilyFact => Boolean(fact));

      if (selectedFacts.length > 0) {
        return limitFacts(selectedFacts, this.resultLimit());
      }
    } catch {
      return fallbackFacts;
    }

    return fallbackFacts;
  }

  private async synthesizeAnswer(
    query: string,
    facts: readonly FamilyFact[]
  ): Promise<string | undefined> {
    if (!this.dependencies.model) {
      return undefined;
    }

    try {
      const response = await this.dependencies.model.runTextRequest({
        purpose: "Synthesize DozerClaw family memory answer",
        input: buildSynthesisPrompt(query, facts)
      });
      const text = response.text.trim();

      return text ? text : undefined;
    } catch {
      return undefined;
    }
  }

  private resultLimit(): number {
    return this.dependencies.resultLimit ?? this.dependencies.recentLimit;
  }
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

function formatFactBullets(facts: readonly FamilyFact[]): string {
  return ["Saved family facts:", ...facts.map((fact) => `- ${fact.body}`)].join(
    "\n"
  );
}

function buildSelectionPrompt(
  query: string,
  facts: readonly FamilyFact[]
): string {
  return [
    "Select the family facts that are relevant to the user query.",
    "Return only fact IDs from the provided list.",
    "",
    "# User query",
    query,
    "",
    "# Candidate facts",
    JSON.stringify(
      facts.map((fact) => ({
        id: fact.id,
        category: fact.category,
        subjectId: fact.subjectId ?? null,
        body: fact.body,
        sourceMessageText: fact.sourceMessageText,
        createdAt: fact.createdAt.toISOString()
      }))
    )
  ].join("\n");
}

function buildSynthesisPrompt(
  query: string,
  facts: readonly FamilyFact[]
): string {
  return [
    "Answer the user query using only the provided family facts.",
    "If the facts do not fully answer the query, say what is known and do not invent details.",
    "",
    "# User query",
    query,
    "",
    "# Family facts",
    JSON.stringify(
      facts.map((fact) => ({
        id: fact.id,
        category: fact.category,
        body: fact.body
      }))
    )
  ].join("\n");
}

function parseSelectedFactIds(text: string): readonly string[] {
  try {
    const parsed = JSON.parse(text) as unknown;

    if (!isRecord(parsed) || !Array.isArray(parsed.factIds)) {
      return [];
    }

    return parsed.factIds.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const factSelectionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    factIds: {
      type: "array",
      items: {
        type: "string"
      }
    }
  },
  required: ["factIds"]
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
