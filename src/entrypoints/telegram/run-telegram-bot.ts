import { buildApp } from "../../composition/build-app.js";
import { loadConfig } from "../../composition/config.js";
import { TelegramAttachmentDownloader } from "../../infrastructure/providers/telegram/telegram-attachment-downloader.js";
import { TelegramApiError } from "../../infrastructure/providers/telegram/telegram-api.js";
import { TelegramBotApiClient } from "../../infrastructure/providers/telegram/telegram-api.js";
import { TelegramBotRuntime } from "../../infrastructure/providers/telegram/telegram-bot-runtime.js";
import { TelegramNotificationDelivery } from "../../infrastructure/providers/telegram/telegram-notification-delivery.js";

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
    token: config.telegram.botToken,
    requestTimeoutMs: config.telegram.requestTimeoutMs
  });
  const attachmentDownloader = new TelegramAttachmentDownloader({
    telegram,
    token: config.telegram.botToken,
    maxBytes: config.telegram.maxAttachmentBytes
  });
  const app = buildApp({
    env,
    attachmentDownloader,
    notificationDelivery: new TelegramNotificationDelivery({ telegram })
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
    const message = [
      `Telegram ${error.method} failed`,
      error.statusCode ? `HTTP ${error.statusCode}` : undefined,
      error.description
    ]
      .filter(Boolean)
      .join(": ");

    return `${redactSensitive(message)}\n`;
  }

  const detail = error instanceof Error ? error.stack : String(error);

  return `${redactSensitive(detail ?? "")}\n`;
}

/**
 * Mask secret-like substrings before writing errors to logs: Telegram bot
 * tokens, bearer tokens, and token/key query parameters. Addresses DC-LOW-004.
 */
export function redactSensitive(text: string): string {
  return text
    .replace(/\d{6,12}:[A-Za-z0-9_-]{30,}/g, "[redacted-telegram-token]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(
      /([?&](?:access_token|refresh_token|token|api_key|apikey|key|secret)=)[^&\s]+/gi,
      "$1[redacted]"
    );
}
