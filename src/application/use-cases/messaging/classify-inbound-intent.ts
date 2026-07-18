import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { MessageAttachment } from "../../../core/domain/messaging/message.js";
import type { DocumentType } from "../../../core/domain/documents/document-record.js";
import type { FamilyFactCategory } from "../../../core/domain/family-memory/family-fact.js";
import type { ModelPort } from "../../../ports/model-port.js";

export type InboundIntent =
  | {
      readonly kind: "ask_clarification";
      readonly question: string;
    }
  | {
      readonly kind: "store_file";
      readonly summary?: string;
      readonly destination?: "local_inbox" | "google_drive";
      readonly documentType?: DocumentType;
      readonly subjectId?: string;
    }
  | {
      readonly kind: "record_fact";
      readonly summary: string;
      readonly category?: FamilyFactCategory;
      readonly subjectId?: string;
    }
  | {
      readonly kind: "create_reminder";
      readonly summary: string;
    }
  | {
      readonly kind: "answer_from_memory";
      readonly query: string;
    }
  | {
      readonly kind: "archive_fact";
      readonly query: string;
    }
  | {
      readonly kind: "register_document";
      readonly externalIdOrUrl: string;
      readonly documentType?: DocumentType;
      readonly subjectId?: string;
    }
  | {
      readonly kind: "find_document";
      readonly query?: string;
      readonly documentType?: DocumentType;
      readonly subjectId?: string;
    }
  | {
      readonly kind: "update_document";
      readonly query: string;
      readonly documentType?: DocumentType;
      readonly subjectId?: string;
    }
  | {
      readonly kind: "archive_document";
      readonly query: string;
    }
  | {
      readonly kind: "save_subject_alias";
      readonly aliasSubjectId: string;
      readonly canonicalSubjectId: string;
    }
  | {
      readonly kind: "list_subject_aliases";
    }
  | {
      readonly kind: "delete_subject_alias";
      readonly aliasSubjectId: string;
    }
  | {
      readonly kind: "diagnose_subject_aliases";
    }
  | {
      readonly kind: "unsupported";
      readonly reason: string;
    };

export interface ClassifyInboundIntentInput {
  readonly text: string;
  readonly attachments: readonly MessageAttachment[];
}

export interface InboundIntentClassifier {
  execute(input: ClassifyInboundIntentInput): Promise<InboundIntent>;
}

export class ModelInboundIntentClassifier implements InboundIntentClassifier {
  constructor(private readonly dependencies: { readonly model: ModelPort }) {}

  async execute(input: ClassifyInboundIntentInput): Promise<InboundIntent> {
    const response = await this.dependencies.model.runTextRequest({
      purpose: "Classify DozerClaw inbound family message intent",
      input: buildClassifierPrompt(input),
      outputSchema: {
        name: "dozerclaw_inbound_intent",
        schema: inboundIntentSchema
      }
    });

    return parseInboundIntent(response.text);
  }
}

function buildClassifierPrompt(input: ClassifyInboundIntentInput): string {
  return [
    readAgentInstruction("MASTER_PROMPT.md"),
    readAgentInstruction("skills/structured-output/SKILL.md"),
    "# Task",
    "Classify the inbound family message into one intent.",
    "",
    "# record_fact field rules",
    [
      "- Use `record_fact` only for durable family memory.",
      "- `summary`: one concise canonical fact sentence.",
      "- `subjectId`: a short stable lowercase subject key such as `max`, `sofia`, `alexey`, or `family`; use `null` when uncertain.",
      "- `category`: choose one of `preference`, `event`, `place`, or `reference_link`.",
      "- Use category `preference` for likes, dislikes, habits, routines, needs, and personal defaults.",
      "- Use category `event` for dated/observable happenings, milestones, appointments, lessons, trips, and completed actions.",
      "- Use category `place` for addresses, schools, venues, favorite locations, and where something belongs.",
      "- Use category `reference_link` for URLs, document links, external references, and pointers to saved resources.",
      "- If category is unclear, use `preference`; if subject is unclear, set `subjectId` to `null`."
    ].join("\n"),
    "",
    "# store_file field rules",
    [
      "- Use `store_file` for uploaded attachments.",
      "- `destination`: use `google_drive` when the user asks for Google Drive, Drive, cloud document storage, or equivalent; use `local_inbox` when they ask to save locally; use `null` when unclear.",
      "- `documentType`: for document-like uploads choose one of `identity`, `legal`, `health`, `finance`, `education`, `travel`, `home`, `reference`, or `other`; use `null` when unclear.",
      "- `subjectId`: a short stable lowercase subject key such as `max`, `sofia`, `alexey`, or `family`; use `null` when uncertain.",
      "- The model only classifies. It must not claim the file was saved."
    ].join("\n"),
    "",
    "# archive_fact field rules",
    [
      "- Use `archive_fact` when the user asks to forget, remove, archive, or stop remembering a saved family fact.",
      "- `query`: the shortest specific phrase that identifies the fact to archive.",
      "- Do not use `archive_fact` for subject alias deletion; use `delete_subject_alias` for aliases."
    ].join("\n"),
    "",
    "# register_document field rules",
    [
      "- Use `register_document` when the user asks to register, save, catalog, or remember an existing Drive document link or file id as a document record.",
      "- `externalIdOrUrl`: the Google Drive URL or external file id from the message.",
      "- `documentType`: choose one of `identity`, `legal`, `health`, `finance`, `education`, `travel`, `home`, `reference`, or `other`; use `null` when uncertain.",
      "- `subjectId`: a short stable lowercase subject key such as `max`, `sofia`, `alexey`, or `family`; use `null` when uncertain.",
      "- Do not use `register_document` for generic Telegram attachments without a Drive link; use `store_file` for uploaded files."
    ].join("\n"),
    "",
    "# find_document field rules",
    [
      "- Use `find_document` when the user asks to show, find, retrieve, list, or look up registered documents.",
      "- `query`: the shortest useful search text, or `null` when the type and subject are enough.",
      "- `documentType`: choose one of `identity`, `legal`, `health`, `finance`, `education`, `travel`, `home`, `reference`, or `other`; use `null` when uncertain.",
      "- `subjectId`: a short stable lowercase subject key such as `max`, `sofia`, `alexey`, or `family`; use `null` when uncertain.",
      "- Do not use `find_document` for family memory facts; use `answer_from_memory` for memory recall."
    ].join("\n"),
    "",
    "# document mutation field rules",
    [
      "- Use `update_document` when the user asks to correct, change, set, or update metadata for a registered document.",
      "- `update_document.query`: the shortest phrase identifying the existing registered document.",
      "- `update_document.documentType`: choose one of `identity`, `legal`, `health`, `finance`, `education`, `travel`, `home`, `reference`, or `other`; use `null` when not changing type.",
      "- `update_document.subjectId`: a short stable lowercase subject key such as `max`, `sofia`, `alexey`, or `family`; use `null` when not changing subject.",
      "- Use `archive_document` when the user asks to archive, remove, hide, or stop showing a registered document record.",
      "- `archive_document.query`: the shortest phrase identifying the registered document to archive.",
      "- Do not use these intents to move, delete, or edit the actual Drive file."
    ].join("\n"),
    "",
    "# subject_alias field rules",
    [
      "- Use `save_subject_alias` when the user says one subject name is another subject, for example `Maksim is Max`.",
      "- `aliasSubjectId`: the alternate name or spelling.",
      "- `canonicalSubjectId`: the stable subject key the alias should resolve to.",
      "- Use `list_subject_aliases` when the user asks to show subject aliases.",
      "- Use `delete_subject_alias` when the user asks to remove one alias.",
      "- Use `diagnose_subject_aliases` when the user asks to check aliases for problems or conflicts."
    ].join("\n"),
    "",
    "# subject_alias examples",
    [
      '{"kind":"save_subject_alias","aliasSubjectId":"Maksim","canonicalSubjectId":"max"}',
      '{"kind":"list_subject_aliases"}',
      '{"kind":"delete_subject_alias","aliasSubjectId":"Maksim"}',
      '{"kind":"diagnose_subject_aliases"}'
    ].join("\n"),
    "",
    "# record_fact examples",
    [
      '{"kind":"record_fact","summary":"Max started swimming lessons.","category":"event","subjectId":"max"}',
      '{"kind":"record_fact","summary":"Sofia likes pasta for lunch.","category":"preference","subjectId":"sofia"}',
      '{"kind":"record_fact","summary":"The family dentist is near Central Park.","category":"place","subjectId":"family"}'
    ].join("\n"),
    "",
    "# archive_fact examples",
    [
      '{"kind":"archive_fact","query":"Max chamomile tea"}',
      '{"kind":"archive_fact","query":"Sofia blue backpack"}'
    ].join("\n"),
    "",
    "# register_document examples",
    [
      '{"kind":"register_document","externalIdOrUrl":"https://drive.google.com/file/d/abc","documentType":"identity","subjectId":"max"}',
      '{"kind":"register_document","externalIdOrUrl":"drive-file-id-abc","documentType":"other","subjectId":"family"}'
    ].join("\n"),
    "",
    "# find_document examples",
    [
      '{"kind":"find_document","query":"passport","documentType":"identity","subjectId":"max"}',
      '{"kind":"find_document","query":"train ticket","documentType":"travel","subjectId":"family"}'
    ].join("\n"),
    "",
    "# document mutation examples",
    [
      '{"kind":"update_document","query":"Max passport","documentType":"identity","subjectId":"max"}',
      '{"kind":"archive_document","query":"old passport"}'
    ].join("\n"),
    "",
    "# Input",
    JSON.stringify({
      text: input.text,
      attachments: input.attachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        hasProviderFileId: Boolean(attachment.providerFileId)
      }))
    })
  ].join("\n\n");
}

function readAgentInstruction(relativePath: string): string {
  return readFileSync(join(agentRootDirectory(), relativePath), "utf8").trim();
}

function agentRootDirectory(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../../agent"
  );
}

export function parseInboundIntent(text: string): InboundIntent {
  try {
    const parsed = JSON.parse(text) as unknown;

    if (!isRecord(parsed) || typeof parsed.kind !== "string") {
      return fallbackIntent();
    }

    if (parsed.kind === "ask_clarification") {
      return {
        kind: "ask_clarification",
        question:
          typeof parsed.question === "string" && parsed.question.trim()
            ? parsed.question.trim()
            : "What should I do with this?"
      };
    }

    if (parsed.kind === "store_file") {
      return {
        kind: "store_file",
        ...(typeof parsed.summary === "string" && parsed.summary.trim()
          ? { summary: parsed.summary.trim() }
          : {}),
        ...optionalFileDestination(parsed.destination),
        ...optionalDocumentType(parsed.documentType),
        ...optionalTrimmedText("subjectId", parsed.subjectId)
      };
    }

    if (parsed.kind === "record_fact" && typeof parsed.summary === "string") {
      return {
        kind: "record_fact",
        summary: parsed.summary.trim(),
        category: parseFamilyFactCategory(parsed.category),
        ...optionalTrimmedText("subjectId", parsed.subjectId)
      };
    }

    if (
      parsed.kind === "create_reminder" &&
      typeof parsed.summary === "string"
    ) {
      return {
        kind: "create_reminder",
        summary: parsed.summary.trim()
      };
    }

    if (
      parsed.kind === "answer_from_memory" &&
      typeof parsed.query === "string"
    ) {
      return {
        kind: "answer_from_memory",
        query: parsed.query.trim()
      };
    }

    if (parsed.kind === "archive_fact" && typeof parsed.query === "string") {
      const query = parsed.query.trim();

      if (query) {
        return {
          kind: "archive_fact",
          query
        };
      }
    }

    if (
      parsed.kind === "register_document" &&
      typeof parsed.externalIdOrUrl === "string"
    ) {
      const externalIdOrUrl = parsed.externalIdOrUrl.trim();

      if (externalIdOrUrl) {
        return {
          kind: "register_document",
          externalIdOrUrl,
          ...optionalDocumentType(parsed.documentType),
          ...optionalTrimmedText("subjectId", parsed.subjectId)
        };
      }
    }

    if (parsed.kind === "find_document") {
      return {
        kind: "find_document",
        ...optionalTrimmedQuery(parsed.query),
        ...optionalDocumentType(parsed.documentType),
        ...optionalTrimmedText("subjectId", parsed.subjectId)
      };
    }

    if (parsed.kind === "update_document" && typeof parsed.query === "string") {
      const query = parsed.query.trim();

      if (query) {
        return {
          kind: "update_document",
          query,
          ...optionalDocumentType(parsed.documentType),
          ...optionalTrimmedText("subjectId", parsed.subjectId)
        };
      }
    }

    if (parsed.kind === "archive_document" && typeof parsed.query === "string") {
      const query = parsed.query.trim();

      if (query) {
        return {
          kind: "archive_document",
          query
        };
      }
    }

    if (
      parsed.kind === "save_subject_alias" &&
      typeof parsed.aliasSubjectId === "string" &&
      typeof parsed.canonicalSubjectId === "string"
    ) {
      const aliasSubjectId = parsed.aliasSubjectId.trim();
      const canonicalSubjectId = parsed.canonicalSubjectId.trim();

      if (aliasSubjectId && canonicalSubjectId) {
        return {
          kind: "save_subject_alias",
          aliasSubjectId,
          canonicalSubjectId
        };
      }
    }

    if (parsed.kind === "list_subject_aliases") {
      return {
        kind: "list_subject_aliases"
      };
    }

    if (
      parsed.kind === "delete_subject_alias" &&
      typeof parsed.aliasSubjectId === "string"
    ) {
      const aliasSubjectId = parsed.aliasSubjectId.trim();

      if (aliasSubjectId) {
        return {
          kind: "delete_subject_alias",
          aliasSubjectId
        };
      }
    }

    if (parsed.kind === "diagnose_subject_aliases") {
      return {
        kind: "diagnose_subject_aliases"
      };
    }

    if (parsed.kind === "unsupported" && typeof parsed.reason === "string") {
      return {
        kind: "unsupported",
        reason: parsed.reason.trim()
      };
    }
  } catch {
    return fallbackIntent();
  }

  return fallbackIntent();
}

const inboundIntentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: [
        "ask_clarification",
        "store_file",
        "record_fact",
        "create_reminder",
        "answer_from_memory",
        "archive_fact",
        "register_document",
        "find_document",
        "update_document",
        "archive_document",
        "save_subject_alias",
        "list_subject_aliases",
        "delete_subject_alias",
        "diagnose_subject_aliases",
        "unsupported"
      ]
    },
    question: {
      type: ["string", "null"]
    },
    summary: {
      type: ["string", "null"]
    },
    category: {
      type: ["string", "null"],
      enum: ["event", "preference", "place", "reference_link", null]
    },
    subjectId: {
      type: ["string", "null"]
    },
    aliasSubjectId: {
      type: ["string", "null"]
    },
    canonicalSubjectId: {
      type: ["string", "null"]
    },
    externalIdOrUrl: {
      type: ["string", "null"]
    },
    documentType: {
      type: ["string", "null"],
      enum: [
        "identity",
        "legal",
        "health",
        "finance",
        "education",
        "travel",
        "home",
        "reference",
        "other",
        null
      ]
    },
    destination: {
      type: ["string", "null"],
      enum: ["local_inbox", "google_drive", null]
    },
    query: {
      type: ["string", "null"]
    },
    reason: {
      type: ["string", "null"]
    }
  },
  required: [
    "kind",
    "question",
    "summary",
    "category",
    "subjectId",
    "aliasSubjectId",
    "canonicalSubjectId",
    "externalIdOrUrl",
    "documentType",
    "destination",
    "query",
    "reason"
  ]
};

function parseFamilyFactCategory(value: unknown): FamilyFactCategory {
  return typeof value === "string" && isFamilyFactCategory(value)
    ? value
    : "preference";
}

function isFamilyFactCategory(value: string): value is FamilyFactCategory {
  return (
    value === "event" ||
    value === "preference" ||
    value === "place" ||
    value === "reference_link"
  );
}

function optionalTrimmedText(
  key: "subjectId",
  value: unknown
): { readonly subjectId?: string } {
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  return {
    [key]: value.trim()
  };
}

function optionalDocumentType(
  value: unknown
): { readonly documentType?: DocumentType } {
  if (typeof value !== "string" || !isDocumentType(value)) {
    return {};
  }

  return {
    documentType: value
  };
}

function optionalFileDestination(
  value: unknown
): { readonly destination?: "local_inbox" | "google_drive" } {
  if (value !== "local_inbox" && value !== "google_drive") {
    return {};
  }

  return {
    destination: value
  };
}

function optionalTrimmedQuery(value: unknown): { readonly query?: string } {
  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  return {
    query: value.trim()
  };
}

function isDocumentType(value: string): value is DocumentType {
  return (
    value === "identity" ||
    value === "legal" ||
    value === "health" ||
    value === "finance" ||
    value === "education" ||
    value === "travel" ||
    value === "home" ||
    value === "reference" ||
    value === "other"
  );
}

function fallbackIntent(): InboundIntent {
  return {
    kind: "ask_clarification",
    question: "What should I do with this?"
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
