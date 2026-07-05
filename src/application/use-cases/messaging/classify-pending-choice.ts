import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ModelPort } from "../../../ports/model-port.js";

export interface PendingChoiceOption<TChoice extends string = string> {
  readonly value: TChoice;
  readonly label: string;
  readonly description: string;
}

export interface ClassifyPendingChoiceInput<TChoice extends string = string> {
  readonly prompt: string;
  readonly userReply: string;
  readonly options: readonly PendingChoiceOption<TChoice>[];
}

export interface PendingChoiceClassifier<TChoice extends string = string> {
  execute(
    input: ClassifyPendingChoiceInput<TChoice>
  ): Promise<TChoice | undefined>;
}

export class ModelPendingChoiceClassifier<TChoice extends string = string>
  implements PendingChoiceClassifier<TChoice>
{
  constructor(private readonly dependencies: { readonly model: ModelPort }) {}

  async execute(
    input: ClassifyPendingChoiceInput<TChoice>
  ): Promise<TChoice | undefined> {
    const response = await this.dependencies.model.runTextRequest({
      purpose: "Classify DozerClaw pending user choice",
      input: buildChoiceClassifierPrompt(input),
      outputSchema: {
        name: "dozerclaw_pending_choice",
        schema: choiceSchema(input.options.map((option) => option.value))
      }
    });

    return parseChoice(response.text, input.options);
  }
}

export function parseChoice<TChoice extends string>(
  text: string,
  options: readonly PendingChoiceOption<TChoice>[]
): TChoice | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;

    if (!isRecord(parsed) || typeof parsed.choice !== "string") {
      return undefined;
    }

    return options.some((option) => option.value === parsed.choice)
      ? (parsed.choice as TChoice)
      : undefined;
  } catch {
    return undefined;
  }
}

function buildChoiceClassifierPrompt<TChoice extends string>(
  input: ClassifyPendingChoiceInput<TChoice>
): string {
  return [
    readAgentInstruction("MASTER_PROMPT.md"),
    readAgentInstruction("skills/structured-output/SKILL.md"),
    "# Task",
    "Classify the user's reply as one of the known pending-choice options.",
    "If the reply does not clearly select an option, return null.",
    "",
    "# Pending Prompt",
    input.prompt,
    "",
    "# Options",
    JSON.stringify(input.options),
    "",
    "# User Reply",
    input.userReply
  ].join("\n\n");
}

function choiceSchema(choices: readonly string[]): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      choice: {
        type: ["string", "null"],
        enum: [...choices, null]
      }
    },
    required: ["choice"]
  };
}

function readAgentInstruction(relativePath: string): string {
  return readFileSync(join(agentRootDirectory(), relativePath), "utf8").trim();
}

function agentRootDirectory(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../../../agent");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
