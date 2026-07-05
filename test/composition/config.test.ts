import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/composition/config.js";

describe("loadConfig", () => {
  it("loads codex model provider config with safe defaults", () => {
    expect(loadConfig({}).codex).toEqual({
      model: "gpt-5.5",
      timeoutMs: 120000,
      projectRoot: ".",
      tmpDirectory: "data/tmp/codex"
    });
  });

  it("loads codex model provider config from environment", () => {
    expect(
      loadConfig({
        DOZERCLAW_CODEX_MODEL: "gpt-test",
        DOZERCLAW_CODEX_TIMEOUT_MS: "3000",
        DOZERCLAW_CODEX_PROJECT_ROOT: "/tmp/project",
        DOZERCLAW_CODEX_TMP_DIR: "/tmp/codex",
        CODEX_API_KEY: "codex-key"
      }).codex
    ).toEqual({
      model: "gpt-test",
      timeoutMs: 3000,
      projectRoot: "/tmp/project",
      tmpDirectory: "/tmp/codex",
      apiKey: "codex-key"
    });
  });
});
