import { buildApp } from "./composition/build-app.js";
import { loadConfig } from "./composition/config.js";
import { runTelegramBot } from "./entrypoints/telegram/run-telegram-bot.js";

const config = loadConfig(process.env);

if (config.telegram.botToken) {
  await runTelegramBot();
} else {
  const app = buildApp();
  const diagnostics = await app.getStartupDiagnostics();

  for (const diagnostic of diagnostics) {
    const detail = diagnostic.detail ? " - " + diagnostic.detail : "";
    console.log(diagnostic.status.toUpperCase() + " " + diagnostic.name + detail);
  }
}
