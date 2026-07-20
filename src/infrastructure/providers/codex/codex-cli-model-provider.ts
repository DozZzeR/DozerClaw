import { spawn as nodeSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
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
  readonly outputSchema?: Record<string, unknown>;
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
      ...(request.outputSchema
        ? { outputSchema: request.outputSchema.schema }
        : {}),
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
  readonly writeFile?: (path: string, data: string) => Promise<void>;
  readonly makeDirectory?: (
    path: string,
    options: { readonly recursive: true }
  ) => Promise<unknown>;
  readonly deleteFile?: (path: string) => Promise<void>;
  readonly outputFileName?: () => string;
  readonly maxDiagnosticBytes?: number;
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
  private readonly writeSchemaFile: (path: string, data: string) => Promise<void>;
  private readonly deleteFile: (path: string) => Promise<void>;
  private readonly outputFileName: () => string;
  private readonly maxDiagnosticBytes: number;

  constructor(dependencies: CodexCliRunnerDependencies = {}) {
    this.spawnProcess =
      dependencies.spawnProcess ??
      ((command, args, options) =>
        nodeSpawn(command, [...args], options) as ChildProcessLike);
    this.readOutputFile = dependencies.readFile ?? readFile;
    this.writeSchemaFile = dependencies.writeFile ?? writeFile;
    this.deleteFile =
      dependencies.deleteFile ??
      ((path) => rm(path, { force: true, recursive: false }));
    this.makeDirectory = dependencies.makeDirectory ?? mkdir;
    this.outputFileName =
      dependencies.outputFileName ??
      (() => `codex-output-${Date.now()}-${randomUUID()}.txt`);
    this.maxDiagnosticBytes = dependencies.maxDiagnosticBytes ?? 8192;
  }

  async run(input: CodexCliRunInput): Promise<CodexCliRunResult> {
    await this.makeDirectory(input.tmpDirectory, { recursive: true });
    await this.makeDirectory(input.projectRoot, { recursive: true });

    const outputFile = join(input.tmpDirectory, this.outputFileName());
    const schemaFile = input.outputSchema
      ? join(input.tmpDirectory, `${this.outputFileName()}.schema.json`)
      : undefined;
    if (schemaFile && input.outputSchema) {
      await this.writeSchemaFile(schemaFile, JSON.stringify(input.outputSchema));
    }
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
      ...(schemaFile ? ["--output-schema", schemaFile] : []),
      input.prompt
    ];

    return new Promise<CodexCliRunResult>((resolve, reject) => {
      let stdoutBuffer = "";
      let stderrBuffer = "";
      let stderr = "";
      let diagnosticBytes = 0;
      let diagnosticTruncated = false;
      let threadId: string | undefined;
      let finalText = "";
      let settled = false;
      let timedOut = false;
      let aborted = false;

      const appendDiagnostic = (text: string) => {
        if (!text || diagnosticTruncated) {
          return;
        }

        const availableBytes = this.maxDiagnosticBytes - diagnosticBytes;
        if (availableBytes <= 0) {
          diagnosticTruncated = true;
          stderr += `\ndiagnostic output truncated after ${this.maxDiagnosticBytes} bytes`;
          return;
        }

        const bytes = Buffer.byteLength(text, "utf8");
        if (bytes <= availableBytes) {
          stderr += text;
          diagnosticBytes += bytes;
          return;
        }

        stderr += Buffer.from(text, "utf8")
          .subarray(0, availableBytes)
          .toString("utf8");
        stderr += `\ndiagnostic output truncated after ${this.maxDiagnosticBytes} bytes`;
        diagnosticBytes = this.maxDiagnosticBytes;
        diagnosticTruncated = true;
      };

      const env = codexEnvironment(input.apiKey);

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

        await this.deleteTemporaryFiles(outputFile, schemaFile);

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
          void this.deleteTemporaryFiles(outputFile, schemaFile).finally(() => {
            reject(new Error("Codex CLI is not installed or not on PATH."));
          });
          return;
        }

        void this.deleteTemporaryFiles(outputFile, schemaFile).finally(() => {
          reject(error);
        });
      });

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString("utf8");
        stdoutBuffer = capPartialBuffer(stdoutBuffer, this.maxDiagnosticBytes);
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
              appendDiagnostic(
                `\n${event.error?.message ?? "Codex error event"}`
              );
            }
            if (event.type === "turn.failed") {
              appendDiagnostic("\nCodex turn failed.");
            }
          } catch {
            appendDiagnostic(`\nUnparsed stdout line: ${trimmed}`);
          }
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        appendDiagnostic(text);
        stderrBuffer += text;
        stderrBuffer = capPartialBuffer(stderrBuffer, this.maxDiagnosticBytes);
        const lines = stderrBuffer.split("\n");
        stderrBuffer = lines.pop() ?? "";
      });

      child.on("close", (code: number | null) => {
        const trailing = stderrBuffer.trim();
        if (trailing) {
          appendDiagnostic(trailing);
        }
        void finish(code);
      });
    });
  }

  private async deleteTemporaryFiles(
    outputFile: string,
    schemaFile: string | undefined
  ): Promise<void> {
    await Promise.all([
      this.deleteFile(outputFile).catch(() => undefined),
      ...(schemaFile
        ? [this.deleteFile(schemaFile).catch(() => undefined)]
        : [])
    ]);
  }
}

function codexEnvironment(apiKey: string | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};

  if (process.env.PATH) {
    env.PATH = process.env.PATH;
  }
  if (process.env.TMPDIR) {
    env.TMPDIR = process.env.TMPDIR;
  }
  if (apiKey) {
    env.CODEX_API_KEY = apiKey;
  }

  return env;
}

function capPartialBuffer(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) {
    return value;
  }

  return Buffer.from(value, "utf8").subarray(-maxBytes).toString("utf8");
}
