export type RuntimeEnvironment = "development" | "test" | "production";

export interface AppConfig {
  readonly environment: RuntimeEnvironment;
  readonly sqlite: SqliteConfig;
  readonly fileStorage: FileStorageConfig;
  readonly telegram: TelegramConfig;
  readonly codex: CodexConfig;
  readonly memory?: MemoryConfig;
  readonly googleDrive?: GoogleDriveConfig;
}

export interface SqliteConfig {
  readonly databasePath: string;
}

export interface FileStorageConfig {
  readonly rootDirectory: string;
}

export interface TelegramConfig {
  readonly botToken?: string;
  readonly ownerUserId?: string;
  readonly pollingTimeoutSeconds: number;
}

export interface CodexConfig {
  readonly modelRoutingEnabled: boolean;
  readonly model: string;
  readonly timeoutMs: number;
  readonly projectRoot: string;
  readonly tmpDirectory: string;
  readonly apiKey?: string;
}

export interface MemoryConfig {
  readonly mempalace?: MempalaceMemoryConfig;
}

export interface GoogleDriveConfig {
  readonly accessToken?: string;
  readonly serviceAccountKeyPath?: string;
  readonly oauth?: GoogleOAuthConfig;
  readonly apiBaseUrl: string;
  readonly uploadFolderId?: string;
  readonly folderIdByPath?: Readonly<Record<string, string>>;
}

export interface GoogleOAuthConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
}

export interface MempalaceMemoryConfig {
  readonly endpointUrl: string;
  readonly wing: string;
  readonly room: string;
  readonly hall?: string;
  readonly bearerToken?: string;
  readonly maxDistance?: number;
  readonly searchLimit: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  return {
    environment: parseEnvironment(env.NODE_ENV),
    sqlite: {
      databasePath: env.DOZERCLAW_DB_PATH ?? "data/dozerclaw.sqlite"
    },
    fileStorage: {
      rootDirectory: env.DOZERCLAW_FILE_STORAGE_ROOT ?? "data/file-inbox"
    },
    telegram: {
      ...(env.DOZERCLAW_TELEGRAM_BOT_TOKEN
        ? { botToken: env.DOZERCLAW_TELEGRAM_BOT_TOKEN }
        : {}),
      ...(env.DOZERCLAW_TELEGRAM_OWNER_USER_ID
        ? { ownerUserId: env.DOZERCLAW_TELEGRAM_OWNER_USER_ID }
        : {}),
      pollingTimeoutSeconds: parsePositiveInteger(
        env.DOZERCLAW_TELEGRAM_POLL_TIMEOUT_SECONDS,
        30
      )
    },
    codex: {
      modelRoutingEnabled:
        env.DOZERCLAW_MODEL_ROUTING_ENABLED === "true" ||
        env.DOZERCLAW_MODEL_ROUTING_ENABLED === "1",
      model: env.DOZERCLAW_CODEX_MODEL ?? "gpt-5.5",
      timeoutMs: parsePositiveInteger(env.DOZERCLAW_CODEX_TIMEOUT_MS, 120000),
      projectRoot: env.DOZERCLAW_CODEX_PROJECT_ROOT ?? ".",
      tmpDirectory: env.DOZERCLAW_CODEX_TMP_DIR ?? "data/tmp/codex",
      ...(env.CODEX_API_KEY ? { apiKey: env.CODEX_API_KEY } : {})
    },
    ...memoryConfig(env),
    ...googleDriveConfig(env)
  };
}

function googleDriveConfig(
  env: NodeJS.ProcessEnv
): { readonly googleDrive?: GoogleDriveConfig } {
  const accessToken = env.DOZERCLAW_GOOGLE_DRIVE_ACCESS_TOKEN?.trim();
  const serviceAccountKeyPath =
    env.DOZERCLAW_GOOGLE_SERVICE_ACCOUNT_KEY_PATH?.trim();
  const oauth = googleOAuthConfig(env);
  const uploadFolderId = env.DOZERCLAW_GOOGLE_DRIVE_UPLOAD_FOLDER_ID?.trim();

  if (!accessToken && !serviceAccountKeyPath && !oauth) {
    return {};
  }

  return {
    googleDrive: {
      ...(accessToken ? { accessToken } : {}),
      ...(serviceAccountKeyPath ? { serviceAccountKeyPath } : {}),
      ...(oauth ? { oauth } : {}),
      apiBaseUrl:
        env.DOZERCLAW_GOOGLE_DRIVE_API_BASE_URL?.trim() ||
        "https://www.googleapis.com",
      ...(uploadFolderId ? { uploadFolderId } : {}),
      ...parseDriveFolderMap(env.DOZERCLAW_DRIVE_FOLDER_MAP_JSON)
    }
  };
}

function googleOAuthConfig(env: NodeJS.ProcessEnv): GoogleOAuthConfig | undefined {
  const clientId = env.DOZERCLAW_GOOGLE_OAUTH_CLIENT?.trim();
  const clientSecret = env.DOZERCLAW_GOOGLE_OAUTH_SECRET?.trim();
  const refreshToken = env.DOZERCLAW_GOOGLE_OAUTH_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return undefined;
  }

  return {
    clientId,
    clientSecret,
    refreshToken
  };
}

function parseDriveFolderMap(
  value: string | undefined
): { readonly folderIdByPath?: Readonly<Record<string, string>> } {
  if (!value?.trim()) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const folderIdByPath: Record<string, string> = {};

    for (const [rawPath, rawFolderId] of Object.entries(parsed)) {
      const path = rawPath.trim();
      const folderId = typeof rawFolderId === "string" ? rawFolderId.trim() : "";

      if (path && folderId) {
        folderIdByPath[path] = folderId;
      }
    }

    return Object.keys(folderIdByPath).length > 0 ? { folderIdByPath } : {};
  } catch {
    return {};
  }
}

function memoryConfig(env: NodeJS.ProcessEnv): { readonly memory?: MemoryConfig } {
  const mempalace = mempalaceMemoryConfig(env);

  return mempalace ? { memory: { mempalace } } : {};
}

function mempalaceMemoryConfig(
  env: NodeJS.ProcessEnv
): MempalaceMemoryConfig | undefined {
  const endpointUrl = env.DOZERCLAW_MEMPALACE_MCP_URL?.trim();

  if (!endpointUrl) {
    return undefined;
  }

  return {
    endpointUrl,
    wing: env.DOZERCLAW_MEMPALACE_WING?.trim() || "family",
    room: env.DOZERCLAW_MEMPALACE_ROOM?.trim() || "facts",
    searchLimit: parsePositiveInteger(env.DOZERCLAW_MEMPALACE_SEARCH_LIMIT, 5),
    ...(env.DOZERCLAW_MEMPALACE_HALL
      ? { hall: env.DOZERCLAW_MEMPALACE_HALL }
      : {}),
    ...(env.DOZERCLAW_MEMPALACE_BEARER_TOKEN
      ? { bearerToken: env.DOZERCLAW_MEMPALACE_BEARER_TOKEN }
      : {}),
    ...parseOptionalNumber("maxDistance", env.DOZERCLAW_MEMPALACE_MAX_DISTANCE)
  };
}

function parseEnvironment(value: string | undefined): RuntimeEnvironment {
  if (value === "production" || value === "test") {
    return value;
  }

  return "development";
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalNumber(
  key: "maxDistance",
  value: string | undefined
): { readonly maxDistance?: number } {
  if (!value) {
    return {};
  }

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? { [key]: parsed } : {};
}
