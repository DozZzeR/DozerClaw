export interface TelegramApi {
  getUpdates(input?: TelegramGetUpdatesInput): Promise<readonly TelegramUpdate[]>;
  sendMessage(chatId: string, text: string): Promise<void>;
}

export interface TelegramFileApi {
  getFile(fileId: string): Promise<TelegramFile>;
  downloadFile(
    url: string,
    options?: TelegramDownloadFileOptions
  ): Promise<Uint8Array>;
}

export interface TelegramDownloadFileOptions {
  readonly maxBytes?: number;
}

export interface TelegramGetUpdatesInput {
  readonly offset?: number;
  readonly timeoutSeconds?: number;
}

export interface TelegramUpdate {
  readonly update_id: number;
  readonly message?: TelegramMessage;
}

export interface TelegramMessage {
  readonly message_id: number;
  readonly date: number;
  readonly chat: TelegramChat;
  readonly from?: TelegramUser;
  readonly text?: string;
  readonly caption?: string;
  readonly document?: TelegramDocument;
  readonly photo?: readonly TelegramPhotoSize[];
}

export interface TelegramChat {
  readonly id: number;
  readonly type: string;
  readonly title?: string;
}

export interface TelegramUser {
  readonly id: number;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly username?: string;
}

export interface TelegramDocument {
  readonly file_id: string;
  readonly file_name?: string;
  readonly mime_type?: string;
  readonly file_size?: number;
}

export interface TelegramPhotoSize {
  readonly file_id: string;
  readonly file_size?: number;
  readonly width: number;
  readonly height: number;
}

export interface TelegramFile {
  readonly file_path?: string;
}

export interface TelegramBotApiClientOptions {
  readonly token: string;
  readonly fetch?: typeof fetch;
  readonly requestTimeoutMs?: number;
}

export interface TelegramApiErrorInput {
  readonly method: string;
  readonly statusCode?: number;
  readonly description?: string;
  readonly cause?: unknown;
}

export class TelegramApiError extends Error {
  readonly method: string;
  readonly statusCode?: number;
  readonly description?: string;
  readonly isConflict: boolean;

  constructor(input: TelegramApiErrorInput) {
    super(
      `Telegram API ${input.method} failed${
        input.statusCode ? `: HTTP ${input.statusCode}` : ""
      }${input.description ? ` (${input.description})` : ""}`
    );
    this.name = "TelegramApiError";
    this.method = input.method;
    if (input.statusCode !== undefined) {
      this.statusCode = input.statusCode;
    }
    if (input.description !== undefined) {
      this.description = input.description;
    }
    this.isConflict = input.statusCode === 409;

    if (input.cause) {
      this.cause = input.cause;
    }
  }
}

export class TelegramBotApiClient implements TelegramApi, TelegramFileApi {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: TelegramBotApiClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
  }

  async getUpdates(
    input: TelegramGetUpdatesInput = {}
  ): Promise<readonly TelegramUpdate[]> {
    const body = {
      ...(input.offset !== undefined ? { offset: input.offset } : {}),
      ...(input.timeoutSeconds !== undefined
        ? { timeout: input.timeoutSeconds }
        : {})
    };
    const response = await this.callTelegram<readonly TelegramUpdate[]>(
      "getUpdates",
      body
    );

    return response;
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    await this.callTelegram("sendMessage", {
      chat_id: chatId,
      text
    });
  }

  async getFile(fileId: string): Promise<TelegramFile> {
    return this.callTelegram<TelegramFile>("getFile", {
      file_id: fileId
    });
  }

  async downloadFile(
    url: string,
    options: TelegramDownloadFileOptions = {}
  ): Promise<Uint8Array> {
    const response = await fetchWithTimeout(
      this.fetchImpl,
      url,
      undefined,
      this.options.requestTimeoutMs,
      "Telegram file download"
    );

    if (!response.ok) {
      throw new Error(`Telegram file download failed: HTTP ${response.status}`);
    }

    return readByteLimitedResponse(
      response,
      options.maxBytes,
      "Telegram file download"
    );
  }

  private async callTelegram<TResponse = unknown>(
    method: string,
    body: Record<string, unknown>
  ): Promise<TResponse> {
    let response: Response;

    try {
      response = await fetchWithTimeout(
        this.fetchImpl,
        `https://api.telegram.org/bot${this.options.token}/${method}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify(body)
        },
        this.options.requestTimeoutMs,
        `Telegram API ${method}`
      );
    } catch (error) {
      throw new TelegramApiError({
        method,
        description: "fetch failed",
        cause: error
      });
    }

    if (!response.ok) {
      const description = await telegramErrorDescription(response);
      throw new TelegramApiError({
        method,
        statusCode: response.status,
        ...(description ? { description } : {})
      });
    }

    const payload = (await response.json()) as {
      ok?: boolean;
      result?: TResponse;
      description?: string;
    };

    if (!payload.ok) {
      throw new TelegramApiError({
        method,
        description: payload.description ?? "unknown"
      });
    }

    return payload.result as TResponse;
  }
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  timeoutMs: number | undefined,
  label: string
): Promise<Response> {
  if (!timeoutMs) {
    return fetchImpl(input, init);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`${label} timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readByteLimitedResponse(
  response: Response,
  maxBytes: number | undefined,
  label: string
): Promise<Uint8Array> {
  const contentLength = response.headers.get("content-length");
  if (
    maxBytes !== undefined &&
    contentLength &&
    Number(contentLength) > maxBytes
  ) {
    throw new Error(
      `${label} exceeds max size: ${Number(contentLength)} bytes > ${maxBytes} bytes`
    );
  }

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    assertByteLimit(bytes.byteLength, maxBytes, label);

    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }

    totalBytes += result.value.byteLength;
    assertByteLimit(totalBytes, maxBytes, label);
    chunks.push(result.value);
  }

  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function assertByteLimit(
  actualBytes: number,
  maxBytes: number | undefined,
  label: string
): void {
  if (maxBytes !== undefined && actualBytes > maxBytes) {
    throw new Error(
      `${label} exceeds max size: ${actualBytes} bytes > ${maxBytes} bytes`
    );
  }
}

async function telegramErrorDescription(response: Response): Promise<string | undefined> {
  try {
    const payload = (await response.json()) as { readonly description?: string };

    return payload.description;
  } catch {
    return undefined;
  }
}
