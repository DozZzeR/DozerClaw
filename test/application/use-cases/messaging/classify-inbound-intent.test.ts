import { describe, expect, it } from "vitest";

import {
  ModelInboundIntentClassifier,
  parseInboundIntent
} from "../../../../src/application/use-cases/messaging/classify-inbound-intent.js";
import type { ModelPort } from "../../../../src/ports/model-port.js";

describe("ModelInboundIntentClassifier", () => {
  it("asks the model for structured inbound intent", async () => {
    const model = new FakeModel(
      JSON.stringify({
        kind: "ask_clarification",
        question: "What is this file?"
      })
    );
    const classifier = new ModelInboundIntentClassifier({ model });

    await expect(
      classifier.execute({
        text: "sent file",
        attachments: [
          {
            id: "attachment-1",
            providerFileId: "telegram-file-1",
            fileName: "scan.jpg",
            mimeType: "image/jpeg",
            sizeBytes: 123
          }
        ]
      })
    ).resolves.toEqual({
      kind: "ask_clarification",
      question: "What is this file?"
    });
    expect(model.request?.purpose).toBe(
      "Classify DozerClaw inbound family message intent"
    );
    expect(model.request?.input).toContain("# DozerClaw Agent");
    expect(model.request?.input).toContain("# Structured Output Skill");
    expect(model.request?.input).toContain(
      "Every field declared in `properties` must be listed in `required`."
    );
    expect(model.request?.outputSchema).toMatchObject({
      name: "dozerclaw_inbound_intent",
      schema: {
        required: ["kind", "question", "summary", "query", "reason"]
      }
    });
    expect(model.request?.input).toContain("scan.jpg");
  });
});

describe("parseInboundIntent", () => {
  it("parses known intents", () => {
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "store_file",
          summary: "passport scan"
        })
      )
    ).toEqual({
      kind: "store_file",
      summary: "passport scan"
    });
  });

  it("falls back to clarification for invalid model output", () => {
    expect(parseInboundIntent("not json")).toEqual({
      kind: "ask_clarification",
      question: "What should I do with this?"
    });
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
