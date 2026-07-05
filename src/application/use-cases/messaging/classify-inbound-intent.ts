import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { MessageAttachment } from "../../../core/domain/messaging/message.js";
import type { ModelPort } from "../../../ports/model-port.js";

export type InboundIntent =
  | {
      readonly kind: "ask_clarification";
      readonly question: string;
    }
  | {
      readonly kind: "store_file";
      readonly summary?: string;
    }
  | {
      readonly kind: "record_fact";
      readonly summary: string;
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
          : {})
      };
    }

    if (parsed.kind === "record_fact" && typeof parsed.summary === "string") {
      return {
        kind: "record_fact",
        summary: parsed.summary.trim()
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
        "unsupported"
      ]
    },
    question: {
      type: ["string", "null"]
    },
    summary: {
      type: ["string", "null"]
    },
    query: {
      type: ["string", "null"]
    },
    reason: {
      type: ["string", "null"]
    }
  },
  required: ["kind", "question", "summary", "query", "reason"]
};

function fallbackIntent(): InboundIntent {
  return {
    kind: "ask_clarification",
    question: "What should I do with this?"
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
