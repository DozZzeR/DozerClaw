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
        url: "https://www.googleapis.com/drive/v3/files/drive-abc?fields=id%2Cname%2CwebViewLink",
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

  it("uploads files through Drive multipart upload", async () => {
    const fetch = new RecordingFetch();
    const provider = new GoogleDriveDocumentStorageProvider({
      accessToken: "drive-token",
      fetch: fetch.fetch.bind(fetch),
      apiBaseUrl: "https://www.googleapis.com"
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
      url: "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id%2Cname%2CwebViewLink",
      authorization: "Bearer drive-token",
      method: "POST"
    });
    expect(fetch.requests[0]?.contentType).toContain("multipart/related");
    await expect(fetch.requests[0]?.body?.text()).resolves.toContain(
      '"name":"Passport.pdf"'
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
      url: "https://www.googleapis.com/drive/v3/files/drive-abc?addParents=folder-identity-max&fields=id",
      authorization: "Bearer drive-token",
      method: "PATCH"
    });
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

  async fetch(input: Parameters<typeof fetch>[0], init?: RequestInit) {
    const headers = new Headers(init?.headers);
    this.requests.push({
      url: String(input),
      authorization: String(headers.get("authorization") ?? ""),
      method: init?.method ?? "GET",
      contentType: String(headers.get("content-type") ?? ""),
      ...(init?.body instanceof Blob ? { body: init.body } : {})
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
