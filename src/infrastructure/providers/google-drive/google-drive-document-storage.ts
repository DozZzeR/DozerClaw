import { randomUUID } from "node:crypto";

import type {
  DocumentStoragePort,
  MoveDocumentInput,
  MovedDocument,
  ResolveDocumentInput,
  ResolvedDocument,
  UploadDocumentInput
} from "../../../ports/document-storage-port.js";

export interface GoogleDriveDocumentStorageProviderOptions {
  readonly accessToken: string;
  readonly apiBaseUrl?: string;
  readonly fetch?: typeof fetch;
}

interface GoogleDriveFileMetadata {
  readonly id?: string;
  readonly name?: string;
  readonly webViewLink?: string;
}

export class GoogleDriveDocumentStorageProvider implements DocumentStoragePort {
  private readonly apiBaseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly options: GoogleDriveDocumentStorageProviderOptions
  ) {
    this.apiBaseUrl = options.apiBaseUrl ?? "https://www.googleapis.com";
    this.fetchImpl = options.fetch ?? fetch;
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
        authorization: `Bearer ${this.options.accessToken}`
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
        authorization: `Bearer ${this.options.accessToken}`,
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
        authorization: `Bearer ${this.options.accessToken}`
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
