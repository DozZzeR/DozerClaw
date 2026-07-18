import { readFileSync } from "node:fs";

import type {
  DocumentFolderPolicyPort,
  DocumentUploadFolderResolution,
  ResolveDocumentUploadFolderInput,
} from "../../../ports/document-folder-policy-port.js";

interface JsonDocumentFolderPolicyFile {
  readonly folders?: readonly JsonDocumentFolderPolicyEntry[];
}

interface JsonDocumentFolderPolicyEntry {
  readonly path?: string;
  readonly driveFolderId?: string;
  readonly description?: string;
  readonly documentTypes?: readonly string[];
  readonly subjects?: readonly string[];
  readonly aliases?: readonly string[];
  readonly examples?: readonly string[];
  readonly folders?: readonly JsonDocumentFolderPolicyEntry[];
}

interface FlatPolicyEntry {
  readonly path: string;
  readonly folderId: string;
  readonly depth: number;
  readonly childOptions: readonly {
    readonly path: string;
    readonly folderId: string;
  }[];
  readonly searchText: string;
  readonly phrases: readonly string[];
  readonly documentTypes: readonly string[];
  readonly subjects: readonly string[];
}

export class JsonDocumentFolderPolicy implements DocumentFolderPolicyPort {
  private constructor(private readonly entries: readonly FlatPolicyEntry[]) {}

  static fromFile(path: string): JsonDocumentFolderPolicy {
    return JsonDocumentFolderPolicy.fromJson(readFileSync(path, "utf8"));
  }

  static fromJson(json: string): JsonDocumentFolderPolicy {
    const parsed = JSON.parse(json) as JsonDocumentFolderPolicyFile;

    return new JsonDocumentFolderPolicy(flattenEntries(parsed.folders ?? []));
  }

  resolveUploadFolder(
    input: ResolveDocumentUploadFolderInput
  ): DocumentUploadFolderResolution | undefined {
    const candidates = this.entries
      .map((entry) => ({
        entry,
        score: scoreEntry(entry, input)
      }))
      .filter((candidate) => candidate.score >= 4)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.entry.depth - a.entry.depth ||
          a.entry.path.localeCompare(b.entry.path)
      );
    const [best, second] = candidates;

    if (!best || (second && best.score - second.score < 2)) {
      return undefined;
    }

    if (best.entry.childOptions.length > 0) {
      return {
        status: "needs_choice",
        path: best.entry.path,
        folderId: best.entry.folderId,
        confidence: Math.min(1, best.score / 10),
        options: best.entry.childOptions
      };
    }

    return {
      status: "resolved",
      path: best.entry.path,
      folderId: best.entry.folderId,
      confidence: Math.min(1, best.score / 10)
    };
  }
}

function flattenEntries(
  entries: readonly JsonDocumentFolderPolicyEntry[],
  result: FlatPolicyEntry[] = []
): readonly FlatPolicyEntry[] {
  for (const entry of entries) {
    if (entry.path && entry.driveFolderId) {
      result.push({
        path: entry.path,
        folderId: entry.driveFolderId,
        depth: entry.path.split("/").length,
        childOptions: (entry.folders ?? []).flatMap((child) =>
          child.path && child.driveFolderId
            ? [
                {
                  path: child.path,
                  folderId: child.driveFolderId
                }
              ]
            : []
        ),
        documentTypes: normalizeList(entry.documentTypes),
        subjects: normalizeList(entry.subjects),
        phrases: normalizePhrases([
          entry.description,
          ...(entry.aliases ?? []),
          ...(entry.examples ?? [])
        ]),
        searchText: normalizeText(
          [
            entry.path,
            entry.description,
            ...(entry.aliases ?? []),
            ...(entry.examples ?? [])
          ].join(" ")
        )
      });
    }

    flattenEntries(entry.folders ?? [], result);
  }

  return result;
}

function scoreEntry(
  entry: FlatPolicyEntry,
  input: ResolveDocumentUploadFolderInput
): number {
  const haystack = normalizeText(
    [input.fileName, input.mimeType, input.userText].filter(Boolean).join(" ")
  );
  let score = 0;

  if (input.subjectId && entry.subjects.includes(normalizeToken(input.subjectId))) {
    score += 3;
  }

  if (input.documentType) {
    const documentType = normalizeToken(input.documentType);

    if (entry.documentTypes.some((type) => documentTypeMatches(type, documentType))) {
      score += 2;
    }
  }

  for (const token of tokens(haystack)) {
    if (token.length >= 3 && entry.searchText.includes(token)) {
      score += 1;
    }
  }

  for (const phrase of entry.phrases) {
    if (phrase.length >= 3 && haystack.includes(phrase)) {
      score += phrase.includes(" ") ? 3 : 1;
    }
  }

  return score;
}

function documentTypeMatches(policyType: string, documentType: string): boolean {
  if (policyType === documentType) {
    return true;
  }

  const broadTypes: Readonly<Record<string, readonly string[]>> = {
    identity: [
      "passport",
      "id_card",
      "visa",
      "birth_certificate",
      "power_of_attorney",
      "driver_license"
    ],
    legal: ["contract", "application", "confirmation", "certificate"],
    health: [
      "medical_record",
      "insurance",
      "insurance_policy",
      "test_result",
      "prescription",
      "scan"
    ],
    finance: [
      "invoice",
      "tax_return",
      "bank_statement",
      "receipt",
      "registration",
      "tax_form",
      "transfer_receipt",
      "broker_report"
    ],
    education: ["resume", "certificate", "study_material", "book", "coursework", "license"],
    travel: ["ticket", "booking"],
    home: ["contract", "utility_bill", "cadaster_extract", "vehicle_registration"],
    reference: ["manual", "note", "image", "archive"]
  };

  return broadTypes[documentType]?.includes(policyType) ?? false;
}

function normalizeList(values: readonly string[] | undefined): readonly string[] {
  return (values ?? []).map(normalizeToken).filter(Boolean);
}

function normalizePhrases(values: readonly (string | undefined)[]): readonly string[] {
  return values.map((value) => normalizeText(value ?? "").trim()).filter(Boolean);
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-zа-яё0-9]+/giu, "_").replace(/^_+|_+$/gu, "");
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-zа-яё0-9]+/giu, " ");
}

function tokens(value: string): readonly string[] {
  return [...new Set(value.split(/\s+/u).filter(Boolean))];
}
