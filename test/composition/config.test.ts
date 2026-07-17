import { describe, expect, it } from "vitest";

import { loadConfig } from "../../src/composition/config.js";

describe("loadConfig", () => {
  it("loads codex model provider config with safe defaults", () => {
    expect(loadConfig({}).codex).toEqual({
      modelRoutingEnabled: false,
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
        DOZERCLAW_MODEL_ROUTING_ENABLED: "true",
        DOZERCLAW_CODEX_TIMEOUT_MS: "3000",
        DOZERCLAW_CODEX_PROJECT_ROOT: "/tmp/project",
        DOZERCLAW_CODEX_TMP_DIR: "/tmp/codex",
        CODEX_API_KEY: "codex-key"
      }).codex
    ).toEqual({
      modelRoutingEnabled: true,
      model: "gpt-test",
      timeoutMs: 3000,
      projectRoot: "/tmp/project",
      tmpDirectory: "/tmp/codex",
      apiKey: "codex-key"
    });
  });

  it("loads MemPalace memory config from environment", () => {
    expect(
      loadConfig({
        DOZERCLAW_MEMPALACE_MCP_URL: "http://127.0.0.1:4118/mcp",
        DOZERCLAW_MEMPALACE_BEARER_TOKEN: "secret",
        DOZERCLAW_MEMPALACE_WING: "family",
        DOZERCLAW_MEMPALACE_ROOM: "facts",
        DOZERCLAW_MEMPALACE_HALL: "facts",
        DOZERCLAW_MEMPALACE_MAX_DISTANCE: "1.2",
        DOZERCLAW_MEMPALACE_SEARCH_LIMIT: "7"
      }).memory
    ).toEqual({
      mempalace: {
        endpointUrl: "http://127.0.0.1:4118/mcp",
        bearerToken: "secret",
        wing: "family",
        room: "facts",
        hall: "facts",
        maxDistance: 1.2,
        searchLimit: 7
      }
    });
  });

  it("loads Google Drive document storage config from environment", () => {
    expect(
      loadConfig({
        DOZERCLAW_GOOGLE_DRIVE_ACCESS_TOKEN: "drive-token",
        DOZERCLAW_GOOGLE_DRIVE_API_BASE_URL: "http://127.0.0.1:9999",
        DOZERCLAW_DRIVE_FOLDER_MAP_JSON:
          '{"Family Documents/max/identity":"folder-max-identity"}'
      }).googleDrive
    ).toEqual({
      accessToken: "drive-token",
      apiBaseUrl: "http://127.0.0.1:9999",
      folderIdByPath: {
        "Family Documents/max/identity": "folder-max-identity"
      }
    });
  });
});
