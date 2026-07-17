import { createSign, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import type {
  DocumentStoragePort,
  MoveDocumentInput,
  MovedDocument,
  ResolveDocumentInput,
  ResolvedDocument,
  UploadDocumentInput
} from "../../../ports/document-storage-port.js";

export interface GoogleDriveDocumentStorageProviderOptions {
  readonly accessToken?: string;
  readonly serviceAccountKeyPath?: string;
  readonly apiBaseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

interface GoogleDriveFileMetadata {
  readonly id?: string;
  readonly name?: string;
  readonly webViewLink?: string;
}

interface ServiceAccountKey {
  readonly client_email: string;
  readonly private_key: string;
  readonly token_uri?: string;
}

interface TokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number;
}

export class GoogleDriveDocumentStorageProvider implements DocumentStoragePort {
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private serviceAccountKey: ServiceAccountKey | undefined;
  private cachedToken:
    | {
        readonly accessToken: string;
        readonly expiresAtMs: number;
      }
    | undefined;

  constructor(
    private readonly options: GoogleDriveDocumentStorageProviderOptions
  ) {
    this.apiBaseUrl = options.apiBaseUrl ?? "https://www.googleapis.com";
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async resolveDocument(
    input: ResolveDocumentInput
  ): Promise<ResolvedDocument> {
    const fileId = parseDriveFileId(input.externalIdOrUrl);
    const url = new URL(
      `/drive/v3/files/${encodeURIComponent(fileId)}`,
      this.apiBaseUrl
    );
    url.searchParams.set("fields", "id,name,webViewLink");

    const response = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        authorization: `Bearer ${await this.accessToken()}`
      }
    });

    if (!response.ok) {
      throw new Error(
        `Google Drive metadata request failed: HTTP ${response.status}`
      );
    }

    const metadata = (await response.json()) as GoogleDriveFileMetadata;

    if (!metadata.id || !metadata.name || !metadata.webViewLink) {
      throw new Error("Google Drive metadata response was incomplete");
    }

    return {
      externalId: metadata.id,
      name: metadata.name,
      url: metadata.webViewLink
    };
  }

  async uploadDocument(input: UploadDocumentInput): Promise<ResolvedDocument> {
    const boundary = `dozerclaw-${randomUUID()}`;
    const url = new URL("/upload/drive/v3/files", this.apiBaseUrl);
    url.searchParams.set("uploadType", "multipart");
    url.searchParams.set("fields", "id,name,webViewLink");

    const response = await this.fetchImpl(url.toString(), {
      method: "POST",
      headers: {
        authorization: `Bearer ${await this.accessToken()}`,
        "content-type": `multipart/related; boundary=${boundary}`
      },
      body: buildMultipartUploadBody(input, boundary)
    });

    if (!response.ok) {
      throw new Error(`Google Drive upload failed: HTTP ${response.status}`);
    }

    const metadata = (await response.json()) as GoogleDriveFileMetadata;

    if (!metadata.id || !metadata.name || !metadata.webViewLink) {
      throw new Error("Google Drive upload response was incomplete");
    }

    return {
      externalId: metadata.id,
      name: metadata.name,
      url: metadata.webViewLink
    };
  }

  async moveDocument(input: MoveDocumentInput): Promise<MovedDocument> {
    const url = new URL(
      `/drive/v3/files/${encodeURIComponent(input.externalId)}`,
      this.apiBaseUrl
    );
    url.searchParams.set("addParents", input.targetFolderId);
    url.searchParams.set("fields", "id");

    const response = await this.fetchImpl(url.toString(), {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${await this.accessToken()}`
      }
    });

    if (!response.ok) {
      throw new Error(`Google Drive move failed: HTTP ${response.status}`);
    }

    const metadata = (await response.json()) as GoogleDriveFileMetadata;

    if (!metadata.id) {
      throw new Error("Google Drive move response was incomplete");
    }

    return {
      externalId: metadata.id
    };
  }

  private async accessToken(): Promise<string> {
    if (this.options.accessToken) {
      return this.options.accessToken;
    }

    if (this.cachedToken && this.cachedToken.expiresAtMs > this.now().getTime()) {
      return this.cachedToken.accessToken;
    }

    const key = this.readServiceAccountKey();
    const token = await this.exchangeServiceAccountJwt(key);
    this.cachedToken = token;

    return token.accessToken;
  }

  private readServiceAccountKey(): ServiceAccountKey {
    if (this.serviceAccountKey) {
      return this.serviceAccountKey;
    }

    if (!this.options.serviceAccountKeyPath) {
      throw new Error("Google Drive authentication is not configured");
    }

    const parsed: unknown = JSON.parse(
      readFileSync(this.options.serviceAccountKeyPath, "utf8")
    );

    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("client_email" in parsed) ||
      !("private_key" in parsed) ||
      typeof parsed.client_email !== "string" ||
      typeof parsed.private_key !== "string"
    ) {
      throw new Error("Google Drive service account key is incomplete");
    }

    this.serviceAccountKey = {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
      ...("token_uri" in parsed && typeof parsed.token_uri === "string"
        ? { token_uri: parsed.token_uri }
        : {})
    };

    return this.serviceAccountKey;
  }

  private async exchangeServiceAccountJwt(key: ServiceAccountKey): Promise<{
    readonly accessToken: string;
    readonly expiresAtMs: number;
  }> {
    const tokenUri = key.token_uri ?? "https://oauth2.googleapis.com/token";
    const issuedAtSeconds = Math.floor(this.now().getTime() / 1000);
    const assertion = signJwt(
      {
        alg: "RS256",
        typ: "JWT"
      },
      {
        iss: key.client_email,
        scope: "https://www.googleapis.com/auth/drive",
        aud: tokenUri,
        iat: issuedAtSeconds,
        exp: issuedAtSeconds + 3600
      },
      key.private_key
    );
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    });

    const response = await this.fetchImpl(tokenUri, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      throw new Error(
        `Google Drive service account token request failed: HTTP ${response.status}`
      );
    }

    const token = (await response.json()) as TokenResponse;

    if (!token.access_token) {
      throw new Error("Google Drive service account token response was incomplete");
    }

    const expiresInMs = (token.expires_in ?? 3600) * 1000;

    return {
      accessToken: token.access_token,
      expiresAtMs: this.now().getTime() + expiresInMs - 60_000
    };
  }
}

function signJwt(
  header: Record<string, unknown>,
  payload: Record<string, unknown>,
  privateKey: string
): string {
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey);

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function buildMultipartUploadBody(
  input: UploadDocumentInput,
  boundary: string
): Blob {
  return new Blob(
    [
      `--${boundary}\r\n`,
      "Content-Type: application/json; charset=UTF-8\r\n\r\n",
      JSON.stringify({ name: input.fileName }),
      "\r\n",
      `--${boundary}\r\n`,
      `Content-Type: ${input.mimeType ?? "application/octet-stream"}\r\n\r\n`,
      input.bytes,
      "\r\n",
      `--${boundary}--\r\n`
    ],
    {
      type: `multipart/related; boundary=${boundary}`
    }
  );
}

function parseDriveFileId(input: string): string {
  const trimmed = input.trim();

  try {
    const url = new URL(trimmed);
    const filePathMatch = url.pathname.match(/\/file\/d\/([^/]+)/u);

    if (filePathMatch?.[1]) {
      return decodeURIComponent(filePathMatch[1]);
    }

    const id = url.searchParams.get("id");

    if (id) {
      return id;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}
