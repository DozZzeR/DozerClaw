import { describe, expect, it } from "vitest";

import { GoogleDriveDocumentStorageProvider } from "../../../src/infrastructure/providers/google-drive/google-drive-document-storage.js";

describe("GoogleDriveDocumentStorageProvider", () => {
  it("resolves Drive file URLs through metadata API", async () => {
    const fetch = new RecordingFetch();
    const provider = new GoogleDriveDocumentStorageProvider({
      accessToken: "drive-token",
      fetch: fetch.fetch.bind(fetch),
      apiBaseUrl: "https://www.googleapis.com"
    });

    await expect(
      provider.resolveDocument({
        externalIdOrUrl: "https://drive.google.com/file/d/drive-abc/view"
      })
    ).resolves.toEqual({
      externalId: "drive-abc",
      name: "Passport.pdf",
      url: "https://drive.google.com/file/d/drive-abc/view"
    });
    expect(fetch.requests).toEqual([
      {
        url: "https://www.googleapis.com/drive/v3/files/drive-abc?fields=id%2Cname%2CwebViewLink",
        authorization: "Bearer drive-token"
      }
    ]);
  });

  it("resolves raw Drive file ids", async () => {
    const fetch = new RecordingFetch();
    const provider = new GoogleDriveDocumentStorageProvider({
      accessToken: "drive-token",
      fetch: fetch.fetch.bind(fetch),
      apiBaseUrl: "https://www.googleapis.com"
    });

    await provider.resolveDocument({
      externalIdOrUrl: "drive-raw-id"
    });

    expect(fetch.requests[0]?.url).toBe(
      "https://www.googleapis.com/drive/v3/files/drive-raw-id?fields=id%2Cname%2CwebViewLink"
    );
  });

  it("rejects failed metadata responses", async () => {
    const provider = new GoogleDriveDocumentStorageProvider({
      accessToken: "drive-token",
      fetch: async () =>
        new Response(JSON.stringify({ error: "not found" }), {
          status: 404
        }),
      apiBaseUrl: "https://www.googleapis.com"
    });

    await expect(
      provider.resolveDocument({
        externalIdOrUrl: "missing"
      })
    ).rejects.toThrow("Google Drive metadata request failed: HTTP 404");
  });
});

class RecordingFetch {
  readonly requests: Array<{ readonly url: string; readonly authorization: string }> =
    [];

  async fetch(input: Parameters<typeof fetch>[0], init?: RequestInit) {
    this.requests.push({
      url: String(input),
      authorization: String(new Headers(init?.headers).get("authorization") ?? "")
    });

    return new Response(
      JSON.stringify({
        id: "drive-abc",
        name: "Passport.pdf",
        webViewLink: "https://drive.google.com/file/d/drive-abc/view"
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  }
}
