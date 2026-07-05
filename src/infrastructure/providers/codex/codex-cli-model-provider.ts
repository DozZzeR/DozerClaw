import { spawn as nodeSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EventEmitter } from "node:events";

import type {
  ModelPort,
  ModelTextRequest,
  ModelTextResponse
} from "../../../ports/model-port.js";

export interface CodexCliModelProviderOptions {
  readonly model: string;
  readonly timeoutMs: number;
  readonly projectRoot: string;
  readonly tmpDirectory: string;
  readonly apiKey?: string;
  readonly runner?: CodexCliRunnerPort;
}

export interface CodexCliRunnerPort {
  run(input: CodexCliRunInput): Promise<CodexCliRunResult>;
}

export interface CodexCliRunInput {
  readonly prompt: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly projectRoot: string;
  readonly tmpDirectory: string;
  readonly apiKey?: string;
  readonly abortSignal?: AbortSignal;
}

export interface CodexCliRunResult {
  readonly text: string;
  readonly threadId?: string;
  readonly outputFile: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly aborted: boolean;
}

export class CodexCliModelProvider implements ModelPort {
  private readonly runner: CodexCliRunnerPort;

  constructor(private readonly options: CodexCliModelProviderOptions) {
    this.runner = options.runner ?? new CodexCliRunner();
  }

  async runTextRequest(
    request: ModelTextRequest
  ): Promise<ModelTextResponse> {
    const result = await this.runner.run({
      prompt: [
        `Purpose: ${request.purpose}`,
        "",
        "Input:",
        request.input,
        "",
        "Return only the response for the application."
      ].join("\n"),
      model: this.options.model,
      timeoutMs: this.options.timeoutMs,
      projectRoot: this.options.projectRoot,
      tmpDirectory: this.options.tmpDirectory,
      ...(this.options.apiKey ? { apiKey: this.options.apiKey } : {})
    });

    return {
      text: result.text
    };
  }
}

export interface CodexCliRunnerDependencies {
  readonly spawnProcess?: SpawnProcess;
  readonly readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
  readonly makeDirectory?: (
    path: string,
    options: { readonly recursive: true }
  ) => Promise<unknown>;
  readonly outputFileName?: () => string;
}

export type SpawnProcess = (
  command: string,
  args: readonly string[],
  options: SpawnProcessOptions
) => ChildProcessLike;

export interface SpawnProcessOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly stdio: ["ignore", "pipe", "pipe"];
}

export interface ChildProcessLike extends EventEmitter {
  readonly stdout: EventEmitter;
  readonly stderr: EventEmitter;
  kill(signal?: NodeJS.Signals | number): boolean;
}

interface JsonEvent {
  readonly type?: string;
  readonly thread_id?: string;
  readonly error?: {
    readonly message?: string;
  };
  readonly item?: {
    readonly type?: string;
    readonly text?: string;
  };
}

export class CodexCliRunner implements CodexCliRunnerPort {
  private readonly spawnProcess: SpawnProcess;
  private readonly readOutputFile: (
    path: string,
    encoding: BufferEncoding
  ) => Promise<string>;
  private readonly makeDirectory: (
    path: string,
    options: { readonly recursive: true }
  ) => Promise<unknown>;
  private readonly outputFileName: () => string;

  constructor(dependencies: CodexCliRunnerDependencies = {}) {
    this.spawnProcess =
      dependencies.spawnProcess ??
      ((command, args, options) =>
        nodeSpawn(command, [...args], options) as ChildProcessLike);
    this.readOutputFile = dependencies.readFile ?? readFile;
    this.makeDirectory = dependencies.makeDirectory ?? mkdir;
    this.outputFileName =
      dependencies.outputFileName ??
      (() => `codex-output-${Date.now()}-${randomUUID()}.txt`);
  }

  async run(input: CodexCliRunInput): Promise<CodexCliRunResult> {
    await this.makeDirectory(input.tmpDirectory, { recursive: true });

    const outputFile = join(input.tmpDirectory, this.outputFileName());
    const args = [
      "exec",
      "--json",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "-C",
      input.projectRoot,
      "-m",
      input.model,
      "-o",
      outputFile,
      input.prompt
    ];

    return new Promise<CodexCliRunResult>((resolve, reject) => {
      let stdoutBuffer = "";
      let stderrBuffer = "";
      let stderr = "";
      let threadId: string | undefined;
      let finalText = "";
      let settled = false;
      let timedOut = false;
      let aborted = false;

      const env = { ...process.env };
      if (input.apiKey) {
        env.CODEX_API_KEY = input.apiKey;
      }

      const child = this.spawnProcess("codex", args, {
        cwd: input.projectRoot,
        env,
        stdio: ["ignore", "pipe", "pipe"]
      });

      const cleanup = () => {
        clearTimeout(timeout);
        input.abortSignal?.removeEventListener("abort", onAbort);
      };

      const finish = async (code: number | null) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();

        if (!finalText) {
          try {
            finalText = (await this.readOutputFile(outputFile, "utf8")).trim();
          } catch {
            finalText = "";
          }
        }

        if (!finalText) {
          finalText = timedOut
            ? "Codex timed out before producing a final message."
            : aborted
              ? "Codex run was stopped."
              : "Codex finished without a final agent message.";
        }

        if (code !== 0 && !timedOut && !aborted) {
          reject(
            new Error(
              `codex exited with code ${code}. ${stderr.trim() || "No stderr output."}`
            )
          );
          return;
        }

        resolve({
          text: finalText.trim(),
          ...(threadId ? { threadId } : {}),
          outputFile,
          stderr: stderr.trim(),
          timedOut,
          aborted
        });
      };

      const timeout = setTimeout(() => {
        timedOut = true;
        stderr += `\nTimed out after ${input.timeoutMs}ms`;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 5000).unref();
      }, input.timeoutMs);

      const onAbort = () => {
        aborted = true;
        stderr += "\nAborted by caller";
        child.kill("SIGTERM");
      };

      input.abortSignal?.addEventListener("abort", onAbort, { once: true });

      child.on("error", (error: unknown) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();

        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === "ENOENT") {
          reject(new Error("Codex CLI is not installed or not on PATH."));
          return;
        }

        reject(error);
      });

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }

          try {
            const event = JSON.parse(trimmed) as JsonEvent;
            if (event.type === "thread.started" && event.thread_id) {
              threadId = event.thread_id;
            }
            if (
              event.type === "item.completed" &&
              event.item?.type === "agent_message" &&
              event.item.text
            ) {
              finalText = event.item.text;
            }
            if (event.type === "error") {
              stderr += `\n${event.error?.message ?? "Codex error event"}`;
            }
            if (event.type === "turn.failed") {
              stderr += "\nCodex turn failed.";
            }
          } catch {
            stderr += `\nUnparsed stdout line: ${trimmed}`;
          }
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stderr += text;
        stderrBuffer += text;
        const lines = stderrBuffer.split("\n");
        stderrBuffer = lines.pop() ?? "";
      });

      child.on("close", (code: number | null) => {
        const trailing = stderrBuffer.trim();
        if (trailing) {
          stderr += trailing;
        }
        void finish(code);
      });
    });
  }
}
