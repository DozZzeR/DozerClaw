import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  it("exchanges a service account JWT for a Drive access token", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-drive-auth-"));
    const keyPath = join(directory, "service-account.json");
    const fetch = new RecordingFetch();

    try {
      writeFileSync(keyPath, JSON.stringify(serviceAccountKey()));
      const provider = new GoogleDriveDocumentStorageProvider({
        serviceAccountKeyPath: keyPath,
        fetch: fetch.fetch.bind(fetch),
        apiBaseUrl: "https://www.googleapis.com",
        now: () => new Date("2026-07-17T12:00:00.000Z")
      });

      await provider.resolveDocument({
        externalIdOrUrl: "drive-abc"
      });

      expect(fetch.tokenRequests).toHaveLength(1);
      expect(fetch.tokenRequests[0]).toMatchObject({
        url: "https://oauth2.googleapis.com/token",
        method: "POST",
        contentType: "application/x-www-form-urlencoded"
      });
      expect(fetch.tokenRequests[0]?.body.get("grant_type")).toBe(
        "urn:ietf:params:oauth:grant-type:jwt-bearer"
      );
      expect(fetch.tokenRequests[0]?.body.get("assertion")).toContain(".");
      expect(fetch.requests[0]).toMatchObject({
        url: "https://www.googleapis.com/drive/v3/files/drive-abc?fields=id%2Cname%2CwebViewLink",
        authorization: "Bearer minted-drive-token"
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("reuses a cached service account access token", async () => {
    const directory = mkdtempSync(join(tmpdir(), "dozerclaw-drive-auth-"));
    const keyPath = join(directory, "service-account.json");
    const fetch = new RecordingFetch();

    try {
      writeFileSync(keyPath, JSON.stringify(serviceAccountKey()));
      const provider = new GoogleDriveDocumentStorageProvider({
        serviceAccountKeyPath: keyPath,
        fetch: fetch.fetch.bind(fetch),
        apiBaseUrl: "https://www.googleapis.com",
        now: () => new Date("2026-07-17T12:00:00.000Z")
      });

      await provider.resolveDocument({ externalIdOrUrl: "drive-abc" });
      await provider.resolveDocument({ externalIdOrUrl: "drive-def" });

      expect(fetch.tokenRequests).toHaveLength(1);
      expect(fetch.requests.map((request) => request.authorization)).toEqual([
        "Bearer minted-drive-token",
        "Bearer minted-drive-token"
      ]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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
  readonly tokenRequests: Array<{
    readonly url: string;
    readonly method: string;
    readonly contentType: string;
    readonly body: URLSearchParams;
  }> = [];

  async fetch(input: Parameters<typeof fetch>[0], init?: RequestInit) {
    const headers = new Headers(init?.headers);

    if (String(input) === "https://oauth2.googleapis.com/token") {
      const body = new URLSearchParams(String(init?.body ?? ""));
      this.tokenRequests.push({
        url: String(input),
        method: init?.method ?? "GET",
        contentType: String(headers.get("content-type") ?? ""),
        body
      });

      return new Response(
        JSON.stringify({
          access_token: "minted-drive-token",
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

function serviceAccountKey() {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048
  });

  return {
    type: "service_account",
    client_email: "family-bot@example.iam.gserviceaccount.com",
    private_key: privateKey.export({
      type: "pkcs8",
      format: "pem"
    }),
    token_uri: "https://oauth2.googleapis.com/token"
  };
}
