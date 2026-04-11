import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import createRenameLog from "./renameLog";

describe("renameLog", () => {
  it("日志归档文件名仅包含 buildId 和时间，且会回写 context.logFile", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "app-builder-rename-log-"));
    const sourceLogFile = join(cwd, "build", "demo.log");
    mkdirSync(join(cwd, "build"), { recursive: true });
    writeFileSync(sourceLogFile, "hello-log");

    const context: Record<string, unknown> = {
      cwd,
      logFile: sourceLogFile,
      projectName: "hugo-aiv-app",
      buildId: "abc123xyz",
      env: "alpha",
      variables: {
        commitId: "deadbeef",
      },
      prepareEnv: {
        packageAlias: "hookAi",
      },
    };

    const task = createRenameLog({ external: "android" });
    const result = (await task(context)) as
      | { archivedLogFile?: string; sourceLogFile?: string }
      | undefined;
    const archivedLogFile = result?.archivedLogFile;
    if (typeof archivedLogFile !== "string") {
      throw new Error("archivedLogFile should be generated");
    }

    expect(basename(archivedLogFile)).toMatch(/^abc123xyz\.\d{8}\.log$/);
    expect(result?.sourceLogFile).toBe(sourceLogFile);
    expect(String(context.logFile)).toBe(archivedLogFile);
    expect(readFileSync(archivedLogFile, "utf8")).toBe("hello-log");
  });
});
