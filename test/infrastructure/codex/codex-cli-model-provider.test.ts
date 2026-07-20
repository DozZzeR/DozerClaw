import { EventEmitter } from "node:events";
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

  it("bounds concurrent codex model requests", async () => {
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

    runner.resolveNext("first-result");
    await expect(first).resolves.toEqual({ text: "first-result" });
    await nextTick();

    expect(runner.startedPurposes).toEqual([
      "Purpose: first",
      "Purpose: second"
    ]);
    runner.resolveNext("second-result");
    await expect(second).resolves.toEqual({ text: "second-result" });
    expect(runner.maxActiveRuns).toBe(1);
  });
});

describe("CodexCliRunner", () => {
  it("runs codex exec with read-only sandbox and parses final agent message", async () => {
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

    const resultPromise = runner.run({
      prompt: "hello",
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
      outputFile: "/tmp/codex/codex-output.txt",
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
        "--sandbox",
        "read-only",
        "-C",
        "/repo",
        "-m",
        "gpt-test",
        "-o",
        "/tmp/codex/codex-output.txt",
        "hello"
      ]
    });
    expect(spawnCalls[0]?.args).not.toContain(
      "--dangerously-bypass-approvals-and-sandbox"
    );
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

    expect(madeDirectories).toEqual([
      "/tmp/codex",
      "/tmp/dozerclaw-codex-workspace"
    ]);
    expect(spawnCalls[0]?.options).toMatchObject({
      cwd: "/tmp/dozerclaw-codex-workspace",
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
        path: "/tmp/codex/intent.schema.json",
        data: JSON.stringify({ type: "object" })
      }
    ]);
    expect(spawnCalls[0]?.args).toContain("--output-schema");
    expect(spawnCalls[0]?.args).toContain("/tmp/codex/intent.schema.json");
    expect(deletedFiles).toEqual([
      "/tmp/codex/codex-output.txt",
      "/tmp/codex/intent.schema.json"
    ]);
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

    const text = await new Promise<string>((resolve) => {
      this.pending.push(resolve);
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
    const resolve = this.pending.shift();
    if (!resolve) {
      throw new Error("no pending codex run");
    }

    resolve(text);
  }
}

function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

class FakeChildProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  killedWith: NodeJS.Signals | number | undefined;

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killedWith = signal;

    return true;
  }
}
