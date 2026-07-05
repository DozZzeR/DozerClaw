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
        input: "new passport"
      })
    ).resolves.toEqual({
      text: "classified"
    });
    expect(runner.input?.model).toBe("gpt-test");
    expect(runner.input?.prompt).toContain("Purpose: classify inbound message");
    expect(runner.input?.prompt).toContain("new passport");
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
    await Promise.resolve();
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

  it("falls back to output file when no final message event is emitted", async () => {
    const child = new FakeChildProcess();
    const runner = new CodexCliRunner({
      spawnProcess: () => child,
      readFile: async () => "file text",
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
    await Promise.resolve();
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
    await Promise.resolve();
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

class FakeChildProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  killedWith: NodeJS.Signals | number | undefined;

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killedWith = signal;

    return true;
  }
}
