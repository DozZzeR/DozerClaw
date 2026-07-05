export type RuntimeEnvironment = "development" | "test" | "production";

export interface AppConfig {
  readonly environment: RuntimeEnvironment;
  readonly sqlite: SqliteConfig;
  readonly fileStorage: FileStorageConfig;
  readonly telegram: TelegramConfig;
  readonly codex: CodexConfig;
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
    }
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
