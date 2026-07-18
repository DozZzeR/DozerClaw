import { pathToFileURL } from "node:url";

export interface DevGoogleOAuthOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly write: (line: string) => void;
  readonly fetch?: typeof fetch;
}

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const DEFAULT_REDIRECT_URI = "http://127.0.0.1:53682/oauth2callback";

interface OAuthTokenResponse {
  readonly refresh_token?: string;
}

export async function runDevGoogleOAuth(
  options: DevGoogleOAuthOptions
): Promise<number> {
  if (options.env.NODE_ENV === "production") {
    options.write("dev Google OAuth helper is not available in production.");

    return 1;
  }

  const clientId = options.env.DOZERCLAW_GOOGLE_OAUTH_CLIENT?.trim();
  const clientSecret = options.env.DOZERCLAW_GOOGLE_OAUTH_SECRET?.trim();
  const redirectUri =
    options.env.DOZERCLAW_GOOGLE_OAUTH_REDIRECT_URI?.trim() ??
    DEFAULT_REDIRECT_URI;

  if (!clientId || !clientSecret) {
    options.write(
      "DOZERCLAW_GOOGLE_OAUTH_CLIENT and DOZERCLAW_GOOGLE_OAUTH_SECRET are required."
    );

    return 1;
  }

  const code = options.env.DOZERCLAW_GOOGLE_OAUTH_CODE?.trim();

  if (!code) {
    options.write("Open this URL and approve Drive access:");
    options.write(buildAuthorizationUrl({ clientId, redirectUri }));
    options.write(
      "Then run again with DOZERCLAW_GOOGLE_OAUTH_CODE set to the returned code."
    );

    return 0;
  }

  const response = await (options.fetch ?? fetch)(TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    })
  });

  if (!response.ok) {
    options.write(`Google OAuth token exchange failed: HTTP ${response.status}`);

    return 1;
  }

  const token = (await response.json()) as OAuthTokenResponse;

  if (!token.refresh_token) {
    options.write("Google OAuth token response did not include refresh_token.");
    options.write(
      "Re-run the authorization URL with prompt=consent, or revoke app access and approve again."
    );

    return 1;
  }

  options.write(`DOZERCLAW_GOOGLE_OAUTH_REFRESH_TOKEN=${token.refresh_token}`);

  return 0;
}

function buildAuthorizationUrl(input: {
  readonly clientId: string;
  readonly redirectUri: string;
}): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DRIVE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  return url.toString();
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const exitCode = await runDevGoogleOAuth({
    env: process.env,
    write(line) {
      console.log(line);
    }
  });

  process.exitCode = exitCode;
}
