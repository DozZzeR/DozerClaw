import { pathToFileURL } from "node:url";

import { loadConfig } from "../../composition/config.js";
import { CodexCliModelProvider } from "../../infrastructure/providers/codex/codex-cli-model-provider.js";
import type { ModelPort } from "../../ports/model-port.js";

export interface CodexHealthcheckOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly write: (line: string) => void;
  readonly modelProvider?: ModelPort;
}

/**
 * Production-safe Codex model availability check used by ops/healthcheck-model.sh.
 * Unlike dev:codex-smoke, this entrypoint runs in NODE_ENV=production and compiles
 * to dist/ so cron does not depend on devDependencies (tsx).
 */
export async function runCodexHealthcheck(
  options: CodexHealthcheckOptions
): Promise<number> {
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
    purpose: "DozerClaw Codex provider health check",
    input: "Reply with exactly: DOZERCLAW_CODEX_SMOKE_OK"
  });

  options.write(response.text);

  return response.text.includes("DOZERCLAW_CODEX_SMOKE_OK") ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const exitCode = await runCodexHealthcheck({
      env: process.env,
      write(line) {
        console.log(line);
      }
    });

    process.exitCode = exitCode;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
