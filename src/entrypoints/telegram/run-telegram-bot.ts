import { buildApp } from "../../composition/build-app.js";
import { loadConfig } from "../../composition/config.js";
import { TelegramAttachmentDownloader } from "../../infrastructure/providers/telegram/telegram-attachment-downloader.js";
import { TelegramApiError } from "../../infrastructure/providers/telegram/telegram-api.js";
import { TelegramBotApiClient } from "../../infrastructure/providers/telegram/telegram-api.js";
import { TelegramBotRuntime } from "../../infrastructure/providers/telegram/telegram-bot-runtime.js";

export interface RunTelegramBotOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly stdout?: Pick<typeof process.stdout, "write">;
  readonly stderr?: Pick<typeof process.stderr, "write">;
}

export async function runTelegramBot(
  options: RunTelegramBotOptions = {}
): Promise<void> {
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const config = loadConfig(env);

  if (!config.telegram.botToken) {
    throw new Error("DOZERCLAW_TELEGRAM_BOT_TOKEN is required");
  }

  const telegram = new TelegramBotApiClient({
    token: config.telegram.botToken
  });
  const attachmentDownloader = new TelegramAttachmentDownloader({
    telegram,
    token: config.telegram.botToken
  });
  const app = buildApp({
    env,
    attachmentDownloader
  });
  const runtime = new TelegramBotRuntime({
    app,
    telegram,
    ...(config.telegram.ownerUserId
      ? { ownerUserId: config.telegram.ownerUserId }
      : {}),
    pollingTimeoutSeconds: config.telegram.pollingTimeoutSeconds,
    onError(error) {
      stderr.write(formatRuntimeError(error));
    }
  });

  process.once("SIGINT", () => runtime.stop());
  process.once("SIGTERM", () => runtime.stop());

  stdout.write("DozerClaw Telegram bot polling started.\n");
  await runtime.start();
}

function formatRuntimeError(error: unknown): string {
  if (error instanceof TelegramApiError) {
    return [
      `Telegram ${error.method} failed`,
      error.statusCode ? `HTTP ${error.statusCode}` : undefined,
      error.description
    ]
      .filter(Boolean)
      .join(": ")
      .concat("\n");
  }

  return `${error instanceof Error ? error.stack : String(error)}\n`;
}
