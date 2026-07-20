import { randomUUID } from "node:crypto";

import type {
  DocumentStoragePort,
  DeleteDocumentInput,
  MoveDocumentInput,
  MovedDocument,
  ResolveDocumentInput,
  ResolvedDocument,
  UploadDocumentInput
} from "../../../ports/document-storage-port.js";

export interface GoogleDriveDocumentStorageProviderOptions {
  readonly accessToken?: string;
  readonly oauth?: GoogleDriveOAuthOptions;
  readonly apiBaseUrl?: string;
  readonly uploadFolderId?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly requestTimeoutMs?: number;
}

export interface GoogleDriveOAuthOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
}

interface GoogleDriveFileMetadata {
  readonly id?: string;
  readonly name?: string;
  readonly webViewLink?: string;
}

interface TokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number;
}

export class GoogleDriveDocumentStorageProvider implements DocumentStoragePort {
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
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
    url.searchParams.set("supportsAllDrives", "true");

    const response = await this.fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: {
        authorization: `Bearer ${await this.accessToken()}`
      }
    });

    if (!response.ok) {
      throw new Error(
        `Google Drive metadata request failed: HTTP ${response.status}${await formatGoogleErrorDetail(response)}`
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
    url.searchParams.set("supportsAllDrives", "true");

    const response = await this.fetchWithTimeout(url.toString(), {
      method: "POST",
      headers: {
        authorization: `Bearer ${await this.accessToken()}`,
        "content-type": `multipart/related; boundary=${boundary}`
      },
      body: buildMultipartUploadBody(
        input,
        boundary,
        input.targetFolderId ?? this.options.uploadFolderId
      )
    });

    if (!response.ok) {
      throw new Error(
        `Google Drive upload failed: HTTP ${response.status}${await formatGoogleErrorDetail(response)}`
      );
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
    url.searchParams.set("supportsAllDrives", "true");

    const response = await this.fetchWithTimeout(url.toString(), {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${await this.accessToken()}`
      }
    });

    if (!response.ok) {
      throw new Error(
        `Google Drive move failed: HTTP ${response.status}${await formatGoogleErrorDetail(response)}`
      );
    }

    const metadata = (await response.json()) as GoogleDriveFileMetadata;

    if (!metadata.id) {
      throw new Error("Google Drive move response was incomplete");
    }

    return {
      externalId: metadata.id
    };
  }

  async deleteDocument(input: DeleteDocumentInput): Promise<void> {
    const url = new URL(
      `/drive/v3/files/${encodeURIComponent(input.externalId)}`,
      this.apiBaseUrl
    );
    url.searchParams.set("supportsAllDrives", "true");

    const response = await this.fetchWithTimeout(url.toString(), {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${await this.accessToken()}`
      }
    });

    if (!response.ok) {
      throw new Error(
        `Google Drive delete failed: HTTP ${response.status}${await formatGoogleErrorDetail(response)}`
      );
    }
  }

  private async accessToken(): Promise<string> {
    if (this.options.accessToken) {
      return this.options.accessToken;
    }

    if (this.cachedToken && this.cachedToken.expiresAtMs > this.now().getTime()) {
      return this.cachedToken.accessToken;
    }

    if (this.options.oauth) {
      const token = await this.exchangeRefreshToken(this.options.oauth);
      this.cachedToken = token;

      return token.accessToken;
    }

    throw new Error("Google Drive authentication is not configured");
  }

  private async exchangeRefreshToken(
    oauth: GoogleDriveOAuthOptions
  ): Promise<{
    readonly accessToken: string;
    readonly expiresAtMs: number;
  }> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: oauth.clientId,
      client_secret: oauth.clientSecret,
      refresh_token: oauth.refreshToken
    });

    const response = await this.fetchWithTimeout("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      throw new Error(
        `Google Drive OAuth refresh request failed: HTTP ${response.status}${await formatGoogleErrorDetail(response)}`
      );
    }

    const token = (await response.json()) as TokenResponse;

    if (!token.access_token) {
      throw new Error("Google Drive OAuth refresh response was incomplete");
    }

    const expiresInMs = (token.expires_in ?? 3600) * 1000;

    return {
      accessToken: token.access_token,
      expiresAtMs: this.now().getTime() + expiresInMs - 60_000
    };
  }

  private async fetchWithTimeout(
    input: Parameters<typeof fetch>[0],
    init: Parameters<typeof fetch>[1]
  ): Promise<Response> {
    const timeoutMs = this.options.requestTimeoutMs;
    if (!timeoutMs) {
      return this.fetchImpl(input, init);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await this.fetchImpl(input, {
        ...init,
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Google Drive request timed out after ${timeoutMs}ms`);
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

}

async function formatGoogleErrorDetail(response: Response): Promise<string> {
  const text = await response.text();

  if (!text) {
    return "";
  }

  try {
    const parsed: unknown = JSON.parse(text);
    const message = googleErrorMessage(parsed);

    return message ? ` (${message})` : "";
  } catch {
    return "";
  }
}

function googleErrorMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || !("error" in value)) {
    return undefined;
  }

  const error = value.error;

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    return typeof error.message === "string" ? error.message : undefined;
  }

  return undefined;
}

function buildMultipartUploadBody(
  input: UploadDocumentInput,
  boundary: string,
  uploadFolderId: string | undefined
): Blob {
  return new Blob(
    [
      `--${boundary}\r\n`,
      "Content-Type: application/json; charset=UTF-8\r\n\r\n",
      JSON.stringify({
        name: input.fileName,
        ...(uploadFolderId ? { parents: [uploadFolderId] } : {})
      }),
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
