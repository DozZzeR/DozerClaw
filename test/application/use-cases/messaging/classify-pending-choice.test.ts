import { describe, expect, it } from "vitest";

import {
  ModelPendingChoiceClassifier,
  parseChoice
} from "../../../../src/application/use-cases/messaging/classify-pending-choice.js";
import type { ModelPort } from "../../../../src/ports/model-port.js";

describe("ModelPendingChoiceClassifier", () => {
  it("asks the model to choose from known pending options", async () => {
    const model = new FakeModel(JSON.stringify({ choice: "overwrite" }));
    const classifier = new ModelPendingChoiceClassifier({ model });

    await expect(
      classifier.execute({
        prompt: "Файл уже есть: report.pdf. Что сделать?",
        userReply: "сделай как надо, замени старый",
        options: [
          {
            value: "copy",
            label: "сохранить копию",
            description: "Save a second file under a generated copy name."
          },
          {
            value: "overwrite",
            label: "перезаписать",
            description: "Replace the existing file."
          },
          {
            value: "skip",
            label: "ничего не делать",
            description: "Leave the existing file unchanged."
          }
        ]
      })
    ).resolves.toBe("overwrite");
    expect(model.request?.purpose).toBe(
      "Classify DozerClaw pending user choice"
    );
    expect(model.request?.input).toContain("# DozerClaw Agent");
    expect(model.request?.input).toContain("# Structured Output Skill");
    expect(model.request?.input).toContain("сделай как надо, замени старый");
    expect(model.request?.outputSchema).toMatchObject({
      name: "dozerclaw_pending_choice",
      schema: {
        required: ["choice"]
      }
    });
  });
});

describe("parseChoice", () => {
  const options = [
    {
      value: "copy",
      label: "copy",
      description: "copy"
    },
    {
      value: "overwrite",
      label: "overwrite",
      description: "overwrite"
    }
  ] as const;

  it("parses known choices", () => {
    expect(parseChoice(JSON.stringify({ choice: "copy" }), options)).toBe(
      "copy"
    );
  });

  it("rejects invalid choices", () => {
    expect(parseChoice(JSON.stringify({ choice: "delete" }), options)).toBeUndefined();
    expect(parseChoice("not json", options)).toBeUndefined();
  });
});

class FakeModel implements ModelPort {
  request: Parameters<ModelPort["runTextRequest"]>[0] | undefined;

  constructor(private readonly text: string) {}

  async runTextRequest(request: Parameters<ModelPort["runTextRequest"]>[0]) {
    this.request = request;

    return {
      text: this.text
    };
  }
}
