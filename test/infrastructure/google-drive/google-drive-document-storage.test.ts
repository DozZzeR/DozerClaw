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
      expect.objectContaining({
        url: "https://www.googleapis.com/drive/v3/files/drive-abc?fields=id%2Cname%2CwebViewLink&supportsAllDrives=true",
        authorization: "Bearer drive-token"
      })
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
      "https://www.googleapis.com/drive/v3/files/drive-raw-id?fields=id%2Cname%2CwebViewLink&supportsAllDrives=true"
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

  it("uploads files through Drive multipart upload", async () => {
    const fetch = new RecordingFetch();
    const provider = new GoogleDriveDocumentStorageProvider({
      accessToken: "drive-token",
      fetch: fetch.fetch.bind(fetch),
      apiBaseUrl: "https://www.googleapis.com",
      uploadFolderId: "folder-inbox"
    });

    await expect(
      provider.uploadDocument({
        fileName: "Passport.pdf",
        mimeType: "application/pdf",
        bytes: new Uint8Array([1, 2, 3])
      })
    ).resolves.toEqual({
      externalId: "drive-abc",
      name: "Passport.pdf",
      url: "https://drive.google.com/file/d/drive-abc/view"
    });
    expect(fetch.requests[0]).toMatchObject({
      url: "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id%2Cname%2CwebViewLink&supportsAllDrives=true",
      authorization: "Bearer drive-token",
      method: "POST"
    });
    expect(fetch.requests[0]?.contentType).toContain("multipart/related");
    await expect(fetch.requests[0]?.body?.text()).resolves.toContain(
      '"name":"Passport.pdf"'
    );
    await expect(fetch.requests[0]?.body?.text()).resolves.toContain(
      '"parents":["folder-inbox"]'
    );
  });

  it("uses an upload target folder before the configured inbox folder", async () => {
    const fetch = new RecordingFetch();
    const provider = new GoogleDriveDocumentStorageProvider({
      accessToken: "drive-token",
      fetch: fetch.fetch.bind(fetch),
      apiBaseUrl: "https://www.googleapis.com",
      uploadFolderId: "folder-inbox"
    });

    await provider.uploadDocument({
      fileName: "Passport.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([1, 2, 3]),
      targetFolderId: "folder-personal-alexey"
    });

    await expect(fetch.requests[0]?.body?.text()).resolves.toContain(
      '"parents":["folder-personal-alexey"]'
    );
  });

  it("moves files by adding a target Drive parent", async () => {
    const fetch = new RecordingFetch();
    const provider = new GoogleDriveDocumentStorageProvider({
      accessToken: "drive-token",
      fetch: fetch.fetch.bind(fetch),
      apiBaseUrl: "https://www.googleapis.com"
    });

    await expect(
      provider.moveDocument({
        externalId: "drive-abc",
        targetFolderId: "folder-identity-max"
      })
    ).resolves.toEqual({
      externalId: "drive-abc"
    });
    expect(fetch.requests[0]).toMatchObject({
      url: "https://www.googleapis.com/drive/v3/files/drive-abc?addParents=folder-identity-max&fields=id&supportsAllDrives=true",
      authorization: "Bearer drive-token",
      method: "PATCH"
    });
  });

  it("deletes files through Drive API", async () => {
    const fetch = new RecordingFetch();
    const provider = new GoogleDriveDocumentStorageProvider({
      accessToken: "drive-token",
      fetch: fetch.fetch.bind(fetch),
      apiBaseUrl: "https://www.googleapis.com"
    });

    await provider.deleteDocument({
      externalId: "drive-abc"
    });

    expect(fetch.requests[0]).toMatchObject({
      url: "https://www.googleapis.com/drive/v3/files/drive-abc?supportsAllDrives=true",
      authorization: "Bearer drive-token",
      method: "DELETE"
    });
  });

  it("exchanges a user OAuth refresh token for a Drive access token", async () => {
    const fetch = new RecordingFetch();
    const provider = new GoogleDriveDocumentStorageProvider({
      oauth: {
        clientId: "oauth-client",
        clientSecret: "oauth-secret",
        refreshToken: "refresh-token"
      },
      fetch: fetch.fetch.bind(fetch),
      apiBaseUrl: "https://www.googleapis.com",
      now: () => new Date("2026-07-18T10:00:00.000Z")
    });

    await provider.resolveDocument({
      externalIdOrUrl: "drive-abc"
    });

    expect(fetch.oauthRefreshRequests).toHaveLength(1);
    expect(fetch.oauthRefreshRequests[0]?.body.get("grant_type")).toBe(
      "refresh_token"
    );
    expect(fetch.oauthRefreshRequests[0]?.body.get("client_id")).toBe(
      "oauth-client"
    );
    expect(fetch.oauthRefreshRequests[0]?.body.get("client_secret")).toBe(
      "oauth-secret"
    );
    expect(fetch.oauthRefreshRequests[0]?.body.get("refresh_token")).toBe(
      "refresh-token"
    );
    expect(fetch.requests[0]?.authorization).toBe("Bearer oauth-drive-token");
  });

  it("reuses a cached user OAuth access token", async () => {
    const fetch = new RecordingFetch();
    const provider = new GoogleDriveDocumentStorageProvider({
      oauth: {
        clientId: "oauth-client",
        clientSecret: "oauth-secret",
        refreshToken: "refresh-token"
      },
      fetch: fetch.fetch.bind(fetch),
      apiBaseUrl: "https://www.googleapis.com",
      now: () => new Date("2026-07-18T10:00:00.000Z")
    });

    await provider.resolveDocument({ externalIdOrUrl: "drive-abc" });
    await provider.resolveDocument({ externalIdOrUrl: "drive-def" });

    expect(fetch.oauthRefreshRequests).toHaveLength(1);
    expect(fetch.requests.map((request) => request.authorization)).toEqual([
      "Bearer oauth-drive-token",
      "Bearer oauth-drive-token"
    ]);
  });
});

class RecordingFetch {
  readonly requests: Array<{
    readonly url: string;
    readonly authorization: string;
    readonly method: string;
    readonly contentType: string;
    readonly body?: Blob;
  }> = [];
  readonly oauthRefreshRequests: Array<{
    readonly url: string;
    readonly method: string;
    readonly contentType: string;
    readonly body: URLSearchParams;
  }> = [];

  async fetch(input: Parameters<typeof fetch>[0], init?: RequestInit) {
    const headers = new Headers(init?.headers);

    if (String(input) === "https://oauth2.googleapis.com/token") {
      const body = new URLSearchParams(String(init?.body ?? ""));
      if (body.get("grant_type") === "refresh_token") {
        this.oauthRefreshRequests.push({
          url: String(input),
          method: init?.method ?? "GET",
          contentType: String(headers.get("content-type") ?? ""),
          body
        });

        return new Response(
          JSON.stringify({
            access_token: "oauth-drive-token",
            expires_in: 3600,
            token_type: "Bearer"
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

    this.requests.push({
      url: String(input),
      authorization: String(headers.get("authorization") ?? ""),
      method: init?.method ?? "GET",
      contentType: String(headers.get("content-type") ?? ""),
      ...(init?.body instanceof Blob ? { body: init.body } : {})
    });

    return new Response(
      init?.method === "DELETE"
        ? undefined
        : JSON.stringify({
            id: "drive-abc",
            name: "Passport.pdf",
            webViewLink: "https://drive.google.com/file/d/drive-abc/view"
          }),
      {
        status: init?.method === "DELETE" ? 204 : 200,
        headers: {
          "content-type": "application/json"
        }
      }
    );
  }
}
