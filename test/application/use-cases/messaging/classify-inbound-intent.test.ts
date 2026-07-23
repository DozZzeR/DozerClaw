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
    expect(model.request?.input).toContain("record_fact field rules");
    expect(model.request?.input).toContain("subjectId");
    expect(model.request?.input).toContain("Use category `event`");
    expect(model.request?.input).toContain("Use category `reference_link`");
    expect(model.request?.input).toContain("save_subject_alias");
    expect(model.request?.outputSchema).toMatchObject({
      name: "dozerclaw_inbound_intent",
      schema: {
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
          "requests",
          "reason"
        ]
      }
    });
    expect(model.request?.input).toContain("victoria");
    expect(model.request?.input).toContain("вики");
    expect(model.request?.input).toContain("Goryainov");
    expect(model.request?.input).toContain("Goryainova");
    expect(model.request?.input).toContain("requests");
    expect(model.request?.input).toContain("query_planning");
    expect(model.request?.input).toContain("scan.jpg");
  });
});

describe("parseInboundIntent", () => {
  it("parses known intents", () => {
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "store_file",
          summary: "passport scan",
          destination: "google_drive",
          documentType: "identity",
          subjectId: "max"
        })
      )
    ).toEqual({
      kind: "store_file",
      summary: "passport scan",
      destination: "google_drive",
      documentType: "identity",
      subjectId: "max"
    });
  });

  it("parses record_fact category and subject id", () => {
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "record_fact",
          summary: "Max started swimming lessons.",
          category: "event",
          subjectId: "  max  "
        })
      )
    ).toEqual({
      kind: "record_fact",
      summary: "Max started swimming lessons.",
      category: "event",
      subjectId: "max"
    });
  });

  it("parses subject alias intents", () => {
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "save_subject_alias",
          aliasSubjectId: "  Maksim ",
          canonicalSubjectId: " Max "
        })
      )
    ).toEqual({
      kind: "save_subject_alias",
      aliasSubjectId: "Maksim",
      canonicalSubjectId: "Max"
    });
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "delete_subject_alias",
          aliasSubjectId: "Maksim"
        })
      )
    ).toEqual({
      kind: "delete_subject_alias",
      aliasSubjectId: "Maksim"
    });
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "list_subject_aliases"
        })
      )
    ).toEqual({
      kind: "list_subject_aliases"
    });
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "diagnose_subject_aliases"
        })
      )
    ).toEqual({
      kind: "diagnose_subject_aliases"
    });
  });

  it("parses archive family fact intent", () => {
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "archive_fact",
          query: "Max tea"
        })
      )
    ).toEqual({
      kind: "archive_fact",
      query: "Max tea"
    });
  });

  it("parses planning query intent", () => {
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "query_planning",
          query: " open family tasks "
        })
      )
    ).toEqual({
      kind: "query_planning",
      query: "open family tasks"
    });
  });

  it("rejects planning query intent without a query", () => {
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "query_planning",
          query: " "
        })
      )
    ).toEqual({
      kind: "unsupported",
      reason: "Unable to classify message intent."
    });
  });

  it("parses register document intent", () => {
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "register_document",
          externalIdOrUrl: " https://drive.google.com/file/d/abc ",
          documentType: "identity",
          subjectId: " max "
        })
      )
    ).toEqual({
      kind: "register_document",
      externalIdOrUrl: "https://drive.google.com/file/d/abc",
      documentType: "identity",
      subjectId: "max"
    });
  });

  it("parses find document intent", () => {
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "find_document",
          query: " passport ",
          documentType: "identity",
          subjectId: " max "
        })
      )
    ).toEqual({
      kind: "find_document",
      query: "passport",
      documentType: "identity",
      subjectId: "max"
    });
  });

  it("parses decomposed find document requests", () => {
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "find_document",
          query: "паспорт алексея и личная карта вики",
          documentType: "identity",
          subjectId: null,
          requests: [
            {
              query: "паспорт",
              documentType: "identity",
              subjectId: "alexey"
            },
            {
              query: "личная карта",
              documentType: "identity",
              subjectId: "вики"
            }
          ]
        })
      )
    ).toEqual({
      kind: "find_document",
      query: "паспорт алексея и личная карта вики",
      documentType: "identity",
      requests: [
        {
          query: "паспорт",
          documentType: "identity",
          subjectId: "alexey"
        },
        {
          query: "личная карта",
          documentType: "identity",
          subjectId: "victoria"
        }
      ]
    });
  });

  it("normalizes document subject ids from family surnames and initials", () => {
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "find_document",
          query: "паспорт",
          documentType: "identity",
          subjectId: "Goryaynov A.V"
        })
      )
    ).toEqual({
      kind: "find_document",
      query: "паспорт",
      documentType: "identity",
      subjectId: "alexey"
    });
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "find_document",
          requests: [
            {
              query: "личная карта",
              documentType: "identity",
              subjectId: "Горяйнова В"
            },
            {
              query: "личная карта",
              documentType: "identity",
              subjectId: "Goryainova SA"
            }
          ]
        })
      )
    ).toEqual({
      kind: "find_document",
      requests: [
        {
          query: "личная карта",
          documentType: "identity",
          subjectId: "victoria"
        },
        {
          query: "личная карта",
          documentType: "identity",
          subjectId: "sofia"
        }
      ]
    });
  });

  it("parses document mutation intents", () => {
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "update_document",
          query: " passport ",
          documentType: "identity",
          subjectId: " max "
        })
      )
    ).toEqual({
      kind: "update_document",
      query: "passport",
      documentType: "identity",
      subjectId: "max"
    });
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "archive_document",
          query: "old passport"
        })
      )
    ).toEqual({
      kind: "archive_document",
      query: "old passport"
    });
  });

  it("falls back to preference category and ignores blank subject ids", () => {
    expect(
      parseInboundIntent(
        JSON.stringify({
          kind: "record_fact",
          summary: "Max started swimming lessons.",
          category: "unknown",
          subjectId: "  "
        })
      )
    ).toEqual({
      kind: "record_fact",
      summary: "Max started swimming lessons.",
      category: "preference"
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
