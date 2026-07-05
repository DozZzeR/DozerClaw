import { pathToFileURL } from "node:url";

import { loadConfig } from "../../composition/config.js";
import { CodexCliModelProvider } from "../../infrastructure/providers/codex/codex-cli-model-provider.js";
import type { ModelPort } from "../../ports/model-port.js";

export interface DevCodexSmokeOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly write: (line: string) => void;
  readonly modelProvider?: ModelPort;
}

export async function runDevCodexSmoke(
  options: DevCodexSmokeOptions
): Promise<number> {
  if (options.env.NODE_ENV === "production") {
    options.write("dev codex smoke is not available in production.");

    return 1;
  }

  const config = loadConfig(options.env);
  const modelProvider =
    options.modelProvider ??
    new CodexCliModelProvider({
      model: config.codex.model,
      timeoutMs: config.codex.timeoutMs,
      projectRoot: config.codex.projectRoot,
      tmpDirectory: config.codex.tmpDirectory,
      ...(config.codex.apiKey ? { apiKey: config.codex.apiKey } : {})
    });
  const response = await modelProvider.runTextRequest({
    purpose: "DozerClaw Codex provider smoke test",
    input: "Reply with exactly: DOZERCLAW_CODEX_SMOKE_OK"
  });

  options.write(response.text);

  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const exitCode = await runDevCodexSmoke({
    env: process.env,
    write(line) {
      console.log(line);
    }
  });

  process.exitCode = exitCode;
}
