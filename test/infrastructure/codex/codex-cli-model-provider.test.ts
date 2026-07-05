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

  it("passes output schema to codex exec when supplied", async () => {
    const child = new FakeChildProcess();
    const spawnCalls: SpawnCall[] = [];
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
