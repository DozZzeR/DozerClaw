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
import type { GoogleOAuthCredentials } from "../google/google-oauth-token-client.js";
import {
  formatGoogleErrorDetail,
  GoogleOAuthTokenClient
} from "../google/google-oauth-token-client.js";

export interface GoogleDriveDocumentStorageProviderOptions {
  readonly accessToken?: string;
  readonly oauth?: GoogleDriveOAuthOptions;
  readonly apiBaseUrl?: string;
  readonly uploadFolderId?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly requestTimeoutMs?: number;
}

export type GoogleDriveOAuthOptions = GoogleOAuthCredentials;

interface GoogleDriveFileMetadata {
  readonly id?: string;
  readonly name?: string;
  readonly webViewLink?: string;
}

export class GoogleDriveDocumentStorageProvider implements DocumentStoragePort {
  private readonly apiBaseUrl: string;
  private readonly tokenClient: GoogleOAuthTokenClient;

  constructor(
    private readonly options: GoogleDriveDocumentStorageProviderOptions
  ) {
    this.apiBaseUrl = options.apiBaseUrl ?? "https://www.googleapis.com";
    this.tokenClient = new GoogleOAuthTokenClient({
      serviceLabel: "Google Drive",
      ...(options.accessToken ? { accessToken: options.accessToken } : {}),
      ...(options.oauth ? { oauth: options.oauth } : {}),
      ...(options.fetch ? { fetch: options.fetch } : {}),
      ...(options.now ? { now: options.now } : {}),
      ...(options.requestTimeoutMs
        ? { requestTimeoutMs: options.requestTimeoutMs }
        : {})
    });
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
      url: formatGoogleDriveFileUrl(metadata.id)
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
      url: formatGoogleDriveFileUrl(metadata.id)
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
    return this.tokenClient.getAccessToken();
  }

  private async fetchWithTimeout(
    input: Parameters<typeof fetch>[0],
    init: Parameters<typeof fetch>[1]
  ): Promise<Response> {
    return this.tokenClient.fetchWithTimeout(input, init);
  }
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

function formatGoogleDriveFileUrl(fileId: string): string {
  return `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;
}
