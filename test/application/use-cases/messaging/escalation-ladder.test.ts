import { describe, expect, it, vi } from "vitest";

import {
  escalate,
  resolved,
  unresolved,
  type ResolutionLayer
} from "../../../../src/application/use-cases/messaging/escalation-ladder.js";

function layer(
  name: string,
  fn: (text: string) => string | undefined
): ResolutionLayer<{ text: string }, string> {
  return {
    name,
    attempt: (ctx) => {
      const value = fn(ctx.text);

      return value === undefined ? unresolved : resolved(value);
    }
  };
}

describe("escalate", () => {
  it("returns the first resolving layer and its name", async () => {
    const outcome = await escalate({ text: "yes" }, [
      layer("dictionary", (t) => (t === "yes" ? "dict" : undefined)),
      layer("model", () => "model")
    ]);

    expect(outcome).toEqual({ value: "dict", layer: "dictionary" });
  });

  it("falls through to later layers when earlier ones do not resolve", async () => {
    const dict = vi.fn(() => undefined);

    const outcome = await escalate({ text: "anything" }, [
      layer("dictionary", dict),
      layer("model", () => "model")
    ]);

    expect(outcome).toEqual({ value: "model", layer: "model" });
    expect(dict).toHaveBeenCalledOnce();
  });

  it("does not attempt later layers once resolved", async () => {
    const second = vi.fn(() => "second");

    await escalate({ text: "x" }, [
      layer("first", () => "first"),
      layer("second", second)
    ]);

    expect(second).not.toHaveBeenCalled();
  });

  it("returns undefined when no layer resolves", async () => {
    const outcome = await escalate({ text: "x" }, [
      layer("a", () => undefined),
      layer("b", () => undefined)
    ]);

    expect(outcome).toBeUndefined();
  });
});
