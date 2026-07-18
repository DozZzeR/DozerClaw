import { describe, expect, it } from "vitest";

import { runDevGoogleOAuth } from "../../../src/entrypoints/cli/dev-google-oauth.js";

describe("runDevGoogleOAuth", () => {
  it("blocks production", async () => {
    const lines: string[] = [];

    const exitCode = await runDevGoogleOAuth({
      env: { NODE_ENV: "production" },
      write: (line) => lines.push(line)
    });

    expect(exitCode).toBe(1);
    expect(lines).toEqual(["dev Google OAuth helper is not available in production."]);
  });

  it("waits for a callback code when no code is provided", async () => {
    const lines: string[] = [];
    const fetch = new RecordingFetch();
    const waitedRedirectUris: string[] = [];

    const exitCode = await runDevGoogleOAuth({
      env: {
        NODE_ENV: "test",
        DOZERCLAW_GOOGLE_OAUTH_CLIENT: "oauth-client",
        DOZERCLAW_GOOGLE_OAUTH_SECRET: "oauth-secret"
      },
      write: (line) => lines.push(line),
      fetch: fetch.fetch.bind(fetch),
      waitForCode: async (redirectUri) => {
        waitedRedirectUris.push(redirectUri);

        return "callback-code";
      }
    });

    expect(exitCode).toBe(0);
    expect(lines[0]).toBe("Open this URL and approve Drive access:");
    expect(lines[1]).toContain("https://accounts.google.com/o/oauth2/v2/auth?");
    expect(lines[1]).toContain("client_id=oauth-client");
    expect(lines[1]).toContain("access_type=offline");
    expect(lines[1]).toContain("prompt=consent");
    expect(lines).toContain("Waiting for OAuth callback...");
    expect(waitedRedirectUris).toEqual(["http://127.0.0.1:53682/oauth2callback"]);
    expect(fetch.requests[0]?.body.get("code")).toBe("callback-code");
    expect(lines).toContain("DOZERCLAW_GOOGLE_OAUTH_REFRESH_TOKEN=refresh-token");
  });

  it("exchanges an authorization code for a refresh token", async () => {
    const lines: string[] = [];
    const fetch = new RecordingFetch();

    const exitCode = await runDevGoogleOAuth({
      env: {
        NODE_ENV: "test",
        DOZERCLAW_GOOGLE_OAUTH_CLIENT: "oauth-client",
        DOZERCLAW_GOOGLE_OAUTH_SECRET: "oauth-secret",
        DOZERCLAW_GOOGLE_OAUTH_CODE: "auth-code"
      },
      write: (line) => lines.push(line),
      fetch: fetch.fetch.bind(fetch)
    });

    expect(exitCode).toBe(0);
    expect(fetch.requests[0]?.body.get("grant_type")).toBe("authorization_code");
    expect(fetch.requests[0]?.body.get("code")).toBe("auth-code");
    expect(lines).toContain("DOZERCLAW_GOOGLE_OAUTH_REFRESH_TOKEN=refresh-token");
  });
});

class RecordingFetch {
  readonly requests: Array<{
    readonly url: string;
    readonly method: string;
    readonly contentType: string;
    readonly body: URLSearchParams;
  }> = [];

  async fetch(input: Parameters<typeof fetch>[0], init?: RequestInit) {
    const headers = new Headers(init?.headers);
    this.requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      contentType: String(headers.get("content-type") ?? ""),
      body: new URLSearchParams(String(init?.body ?? ""))
    });

    return new Response(
      JSON.stringify({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        token_type: "Bearer"
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  }
}
