export interface GoogleOAuthCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
}

export interface GoogleOAuthTokenClientOptions {
  readonly serviceLabel: string;
  readonly accessToken?: string;
  readonly oauth?: GoogleOAuthCredentials;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
  readonly requestTimeoutMs?: number;
}

interface TokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number;
}

export class GoogleOAuthTokenClient {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private cachedToken:
    | {
        readonly accessToken: string;
        readonly expiresAtMs: number;
      }
    | undefined;

  constructor(private readonly options: GoogleOAuthTokenClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async getAccessToken(): Promise<string> {
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

    throw new Error(`${this.options.serviceLabel} authentication is not configured`);
  }

  async fetchWithTimeout(
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
        throw new Error(
          `${this.options.serviceLabel} request timed out after ${timeoutMs}ms`
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async exchangeRefreshToken(
    oauth: GoogleOAuthCredentials
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

    const response = await this.fetchWithTimeout(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded"
        },
        body
      }
    );

    if (!response.ok) {
      throw new Error(
        `${this.options.serviceLabel} OAuth refresh request failed: HTTP ${response.status}${await formatGoogleErrorDetail(response)}`
      );
    }

    const token = (await response.json()) as TokenResponse;

    if (!token.access_token) {
      throw new Error(
        `${this.options.serviceLabel} OAuth refresh response was incomplete`
      );
    }

    const expiresInMs = (token.expires_in ?? 3600) * 1000;

    return {
      accessToken: token.access_token,
      expiresAtMs: this.now().getTime() + expiresInMs - 60_000
    };
  }
}

export async function formatGoogleErrorDetail(
  response: Response
): Promise<string> {
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
