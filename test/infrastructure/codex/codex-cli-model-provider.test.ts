import { EventEmitter } from "node:events";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CodexCliModelProvider,
  CodexCliRunner,
  type CodexCliRunInput
} from "../../../src/infrastructure/providers/codex/codex-cli-model-provider.js";

describe("CodexCliModelProvider", () => {
  it("wraps text requests for codex cli", async () => {
    const runner = new FakeRunner("classified");
    const provider = new CodexCliModelProvider({
      model: "gpt-test",
      timeoutMs: 5000,
      projectRoot: "/repo",
      tmpDirectory: "/tmp",
      runner
    });

    await expect(
      provider.runTextRequest({
        purpose: "classify inbound message",
        input: "new passport",
        outputSchema: {
          name: "intent",
          schema: {
            type: "object"
          }
        }
      })
    ).resolves.toEqual({
      text: "classified"
    });
    expect(runner.input?.model).toBe("gpt-test");
    expect(runner.input?.prompt).toContain("Purpose: classify inbound message");
    expect(runner.input?.prompt).toContain("new passport");
    expect(runner.input?.outputSchema).toEqual({
      type: "object"
    });
  });

  it("bounds concurrent codex model requests even when a third arrives during hand-off", async () => {
    const runner = new BlockingRunner();
    const provider = new CodexCliModelProvider({
      model: "gpt-test",
      timeoutMs: 5000,
      projectRoot: "/repo",
      tmpDirectory: "/tmp",
      maxConcurrency: 1,
      runner
    });

    const first = provider.runTextRequest({
      purpose: "first",
      input: "one"
    });
    const second = provider.runTextRequest({
      purpose: "second",
      input: "two"
    });
    await nextTick();

    expect(runner.activeRuns).toBe(1);
    expect(runner.startedPurposes).toEqual(["Purpose: first"]);

    // Resolve first and synchronously enqueue a third call before second resumes.
    runner.resolveNext("first-result");
    const third = provider.runTextRequest({
      purpose: "third",
      input: "three"
    });
    await expect(first).resolves.toEqual({ text: "first-result" });
    await nextTick();

    expect(runner.maxActiveRuns).toBe(1);
    expect(runner.startedPurposes).toEqual([
      "Purpose: first",
      "Purpose: second"
    ]);
    runner.resolveNext("second-result");
    await expect(second).resolves.toEqual({ text: "second-result" });
    await nextTick();

    expect(runner.maxActiveRuns).toBe(1);
    expect(runner.startedPurposes).toEqual([
      "Purpose: first",
      "Purpose: second",
      "Purpose: third"
    ]);
    runner.resolveNext("third-result");
    await expect(third).resolves.toEqual({ text: "third-result" });
    expect(runner.maxActiveRuns).toBe(1);
  });
});

describe("CodexCliRunner", () => {
  it("runs codex exec with read-only sandbox, stdin prompt, and parses final agent message", async () => {
    const child = new FakeChildProcess();
    const spawnCalls: SpawnCall[] = [];
    const runner = new CodexCliRunner({
      spawnProcess(command, args, options) {
        spawnCalls.push({ command, args, options });
        return child;
      },
      readFile: async () => "",
      writeFile: async () => undefined,
      makeDirectory: async () => undefined,
      outputFileName: () => "codex-output.txt"
    });

    const resolvedProjectRoot = resolve("/repo");
    const resolvedTmpDir = resolve("/tmp/codex");
    const expectedOutputFile = join(resolvedTmpDir, "codex-output.txt");

    const resultPromise = runner.run({
      prompt: "secret family prompt",
      model: "gpt-test",
      timeoutMs: 5000,
      projectRoot: "/repo",
      tmpDirectory: "/tmp/codex"
    });
    await nextTick();
    child.stdout.emit(
      "data",
      Buffer.from(
        [
          JSON.stringify({
            type: "thread.started",
            thread_id: "thread-1"
          }),
          JSON.stringify({
            type: "item.completed",
            item: {
              type: "agent_message",
              text: "final text"
            }
          }),
          ""
        ].join("\n")
      )
    );
    child.emit("close", 0);

    await expect(resultPromise).resolves.toEqual({
      text: "final text",
      threadId: "thread-1",
      outputFile: expectedOutputFile,
      stderr: "",
      timedOut: false,
      aborted: false
    });
    expect(spawnCalls[0]).toMatchObject({
      command: "codex",
      args: [
        "exec",
        "--json",
        "--ephemeral",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "-C",
        resolvedProjectRoot,
        "-m",
        "gpt-test",
        "-o",
        expectedOutputFile,
        "-"
      ]
    });
    expect(spawnCalls[0]?.args).not.toContain("secret family prompt");
    expect(child.stdin.written).toBe("secret family prompt");
    expect(child.stdin.ended).toBe(true);
    expect(spawnCalls[0]?.args).not.toContain(
      "--dangerously-bypass-approvals-and-sandbox"
    );
  });

  it("resolves relative projectRoot and tmpDirectory to absolute paths before spawning", async () => {
    const child = new FakeChildProcess();
    const spawnCalls: SpawnCall[] = [];
    const madeDirectories: string[] = [];
    const writtenFiles: { path: string; data: string }[] = [];
    const runner = new CodexCliRunner({
      spawnProcess(command, args, options) {
        spawnCalls.push({ command, args, options });
        return child;
      },
      readFile: async () => "",
      writeFile: async (path, data) => {
        writtenFiles.push({ path, data });
      },
      makeDirectory: async (path) => {
        madeDirectories.push(path);
      },
      outputFileName: (() => {
        const names = ["codex-output.txt", "intent"];
        return () => names.shift() ?? "fallback";
      })()
    });

    const expectedProjectRoot = resolve("data/tmp/codex/workspace");
    const expectedTmpDir = resolve("data/tmp/codex");
    const expectedOutputFile = join(expectedTmpDir, "codex-output.txt");
    const expectedSchemaFile = join(expectedTmpDir, "intent.schema.json");

    const resultPromise = runner.run({
      prompt: "hello",
      model: "gpt-test",
      timeoutMs: 5000,
      projectRoot: "data/tmp/codex/workspace",
      tmpDirectory: "data/tmp/codex",
      outputSchema: { type: "object" }
    });
    await nextTick();
    child.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({
          type: "item.completed",
          item: { type: "agent_message", text: "{}" }
        })}\n`
      )
    );
    child.emit("close", 0);

    await expect(resultPromise).resolves.toMatchObject({
      text: "{}",
      outputFile: expectedOutputFile
    });
    expect(madeDirectories).toEqual([expectedTmpDir, expectedProjectRoot]);
    expect(writtenFiles[0]?.path).toBe(expectedSchemaFile);
    expect(spawnCalls[0]?.options).toMatchObject({
      cwd: expectedProjectRoot
    });
    expect(spawnCalls[0]?.args).toContain(expectedProjectRoot);
    expect(spawnCalls[0]?.args).toContain(expectedOutputFile);
    expect(spawnCalls[0]?.args).toContain(expectedSchemaFile);
  });

  it("runs codex in an isolated cwd with an allowlisted environment", async () => {
    const child = new FakeChildProcess();
    const spawnCalls: SpawnCall[] = [];
    const madeDirectories: string[] = [];
    const previousSecret = process.env.DOZERCLAW_TEST_SECRET;
    process.env.DOZERCLAW_TEST_SECRET = "must-not-leak";
    const previousPath = process.env.PATH;
    process.env.PATH = "/usr/bin";
    const runner = new CodexCliRunner({
      spawnProcess(command, args, options) {
        spawnCalls.push({ command, args, options });
        return child;
      },
      readFile: async () => "file text",
      writeFile: async () => undefined,
      makeDirectory: async (path) => {
        madeDirectories.push(path);
      },
      outputFileName: () => "codex-output.txt"
    });

    const expectedProjectRoot = resolve("/tmp/dozerclaw-codex-workspace");
    const expectedTmpDir = resolve("/tmp/codex");

    try {
      const resultPromise = runner.run({
        prompt: "hello",
        model: "gpt-test",
        timeoutMs: 5000,
        projectRoot: "/tmp/dozerclaw-codex-workspace",
        tmpDirectory: "/tmp/codex",
        apiKey: "codex-key"
      });
      await nextTick();
      child.emit("close", 0);

      await expect(resultPromise).resolves.toMatchObject({ text: "file text" });
    } finally {
      if (previousSecret === undefined) {
        delete process.env.DOZERCLAW_TEST_SECRET;
      } else {
        process.env.DOZERCLAW_TEST_SECRET = previousSecret;
      }
      if (previousPath === undefined) {
        delete process.env.PATH;
      } else {
        process.env.PATH = previousPath;
      }
    }

    expect(madeDirectories).toEqual([expectedTmpDir, expectedProjectRoot]);
    expect(spawnCalls[0]?.options).toMatchObject({
      cwd: expectedProjectRoot,
      env: {
        CODEX_API_KEY: "codex-key",
        PATH: "/usr/bin"
      }
    });
    expect(
      (spawnCalls[0]?.options as { env?: NodeJS.ProcessEnv } | undefined)?.env
        ?.DOZERCLAW_TEST_SECRET
    ).toBeUndefined();
  });

  it("passes output schema to codex exec when supplied", async () => {
    const child = new FakeChildProcess();
    const spawnCalls: SpawnCall[] = [];
    const writtenFiles: { path: string; data: string }[] = [];
    const deletedFiles: string[] = [];
    const runner = new CodexCliRunner({
      spawnProcess(command, args, options) {
        spawnCalls.push({ command, args, options });
        return child;
      },
      readFile: async () => "",
      writeFile: async (path, data) => {
        writtenFiles.push({ path, data });
      },
      deleteFile: async (path) => {
        deletedFiles.push(path);
      },
      makeDirectory: async () => undefined,
      outputFileName: (() => {
        const names = ["codex-output.txt", "intent"];
        return () => names.shift() ?? "fallback";
      })()
    });

    const expectedTmpDir = resolve("/tmp/codex");
    const expectedOutputFile = join(expectedTmpDir, "codex-output.txt");
    const expectedSchemaFile = join(expectedTmpDir, "intent.schema.json");

    const resultPromise = runner.run({
      prompt: "hello",
      model: "gpt-test",
      timeoutMs: 5000,
      projectRoot: "/repo",
      tmpDirectory: "/tmp/codex",
      outputSchema: {
        type: "object"
      }
    });
    await nextTick();
    child.stdout.emit(
      "data",
      Buffer.from(
        `${JSON.stringify({
          type: "item.completed",
          item: {
            type: "agent_message",
            text: "{}"
          }
        })}\n`
      )
    );
    child.emit("close", 0);

    await expect(resultPromise).resolves.toMatchObject({ text: "{}" });
    expect(writtenFiles).toEqual([
      {
        path: expectedSchemaFile,
        data: JSON.stringify({ type: "object" })
      }
    ]);
    expect(spawnCalls[0]?.args).toContain("--output-schema");
    expect(spawnCalls[0]?.args).toContain(expectedSchemaFile);
    expect(deletedFiles).toEqual([expectedOutputFile, expectedSchemaFile]);
  });

  it("parses valid JSON stdout events larger than maxDiagnosticBytes without truncating", async () => {
    const child = new FakeChildProcess();
    const runner = new CodexCliRunner({
      spawnProcess: () => child,
      readFile: async () => "",
      writeFile: async () => undefined,
      makeDirectory: async () => undefined,
      outputFileName: () => "codex-output.txt",
      maxDiagnosticBytes: 128
    });

    const largeText = "Привет мир! ".repeat(1000).trim();
    const payload = Buffer.from(
      `${JSON.stringify({
        type: "item.completed",
        item: {
          type: "agent_message",
          text: largeText
        }
      })}\n`
    );

    const resultPromise = runner.run({
      prompt: "hello",
      model: "gpt-test",
      timeoutMs: 5000,
      projectRoot: "/repo",
      tmpDirectory: "/tmp/codex"
    });
    await nextTick();
    // Split mid-UTF-8 multibyte sequence across two chunks.
    child.stdout.emit("data", payload.subarray(0, 500));
    child.stdout.emit("data", payload.subarray(500));
    child.emit("close", 0);

    await expect(resultPromise).resolves.toMatchObject({
      text: largeText,
      stderr: ""
    });
  });

  it("caps diagnostic output from stdout and stderr", async () => {
    const child = new FakeChildProcess();
    const runner = new CodexCliRunner({
      spawnProcess: () => child,
      readFile: async () => "",
      writeFile: async () => undefined,
      makeDirectory: async () => undefined,
      outputFileName: () => "codex-output.txt",
      maxDiagnosticBytes: 32
    });

    const resultPromise = runner.run({
      prompt: "hello",
      model: "gpt-test",
      timeoutMs: 5000,
      projectRoot: "/repo",
      tmpDirectory: "/tmp/codex"
    });
    await nextTick();
    child.stdout.emit("data", Buffer.from("not-json-line\n".repeat(20)));
    child.stderr.emit("data", Buffer.from("stderr-line\n".repeat(20)));
    child.emit("close", 1);

    await expect(resultPromise).rejects.toThrow(
      "diagnostic output truncated after 32 bytes"
    );
  });

  it("does not duplicate trailing stderr without a newline", async () => {
    const child = new FakeChildProcess();
    const runner = new CodexCliRunner({
      spawnProcess: () => child,
      readFile: async () => "",
      writeFile: async () => undefined,
      makeDirectory: async () => undefined,
      outputFileName: () => "codex-output.txt"
    });

    const resultPromise = runner.run({
      prompt: "hello",
      model: "gpt-test",
      timeoutMs: 5000,
      projectRoot: "/repo",
      tmpDirectory: "/tmp/codex"
    });
    await nextTick();
    child.stderr.emit("data", Buffer.from("single trailing error"));
    child.emit("close", 1);

    await expect(resultPromise).rejects.toThrow(
      /^codex exited with code 1\. single trailing error$/
    );
  });

  it("falls back to output file when no final message event is emitted", async () => {
    const child = new FakeChildProcess();
    const runner = new CodexCliRunner({
      spawnProcess: () => child,
      readFile: async () => "file text",
      writeFile: async () => undefined,
      makeDirectory: async () => undefined,
      outputFileName: () => "codex-output.txt"
    });

    const resultPromise = runner.run({
      prompt: "hello",
      model: "gpt-test",
      timeoutMs: 5000,
      projectRoot: "/repo",
      tmpDirectory: "/tmp/codex"
    });
    await nextTick();
    child.emit("close", 0);

    await expect(resultPromise).resolves.toMatchObject({
      text: "file text"
    });
  });

  it("rejects non-zero exits with stderr", async () => {
    const child = new FakeChildProcess();
    const runner = new CodexCliRunner({
      spawnProcess: () => child,
      readFile: async () => "",
      writeFile: async () => undefined,
      makeDirectory: async () => undefined,
      outputFileName: () => "codex-output.txt"
    });

    const resultPromise = runner.run({
      prompt: "hello",
      model: "gpt-test",
      timeoutMs: 5000,
      projectRoot: "/repo",
      tmpDirectory: "/tmp/codex"
    });
    await nextTick();
    child.stderr.emit("data", Buffer.from("bad things\n"));
    child.emit("close", 1);

    await expect(resultPromise).rejects.toThrow(
      "codex exited with code 1. bad things"
    );
  });
});

interface SpawnCall {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: unknown;
}

class FakeRunner {
  input: CodexCliRunInput | undefined;

  constructor(private readonly text: string) {}

  async run(input: CodexCliRunInput) {
    this.input = input;

    return {
      text: this.text,
      outputFile: "/tmp/output.txt",
      stderr: "",
      timedOut: false,
      aborted: false
    };
  }
}

class BlockingRunner {
  activeRuns = 0;
  maxActiveRuns = 0;
  readonly startedPurposes: string[] = [];
  private readonly pending: Array<(text: string) => void> = [];

  async run(input: CodexCliRunInput) {
    this.activeRuns += 1;
    this.maxActiveRuns = Math.max(this.maxActiveRuns, this.activeRuns);
    this.startedPurposes.push(input.prompt.split("\n")[0] ?? "");

    const text = await new Promise<string>((resolveRun) => {
      this.pending.push(resolveRun);
    });
    this.activeRuns -= 1;

    return {
      text,
      outputFile: "/tmp/output.txt",
      stderr: "",
      timedOut: false,
      aborted: false
    };
  }

  resolveNext(text: string): void {
    const resolveRun = this.pending.shift();
    if (!resolveRun) {
      throw new Error("no pending codex run");
    }

    resolveRun(text);
  }
}

function nextTick(): Promise<void> {
  return new Promise((resolveTick) => setImmediate(resolveTick));
}

class FakeStdin {
  written = "";
  ended = false;

  write(chunk: string): boolean {
    this.written += chunk;
    return true;
  }

  end(): void {
    this.ended = true;
  }

  on(): this {
    return this;
  }
}

class FakeChildProcess extends EventEmitter {
  readonly stdin = new FakeStdin();
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  killedWith: NodeJS.Signals | number | undefined;

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killedWith = signal;

    return true;
  }
}
