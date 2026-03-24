import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { loadRunState } from "./state";
import { runStep } from "./steps";

const createdRuns: string[] = [];

afterEach(() => {
  while (createdRuns.length > 0) {
    const runId = createdRuns.pop();
    if (runId) {
      rmSync(resolve(process.cwd(), ".runs", runId), {
        recursive: true,
        force: true,
      });
    }
  }
});

describe("runStep", () => {
  test("resolve_config creates a run directory and step state", async () => {
    const runId = `resolve-config-${Date.now()}`;
    createdRuns.push(runId);
    const result = await runStep({
      cwd: process.cwd(),
      runId,
      stepId: "resolve_config",
      requestInput: {
        runId,
        projectId: "hugo-aiv-app",
        profileId: "hookAi-android-alpha",
        overrides: {},
      },
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("success");
    expect(
      existsSync(resolve(process.cwd(), ".runs", runId, "resolved-config.json"))
    ).toBe(true);
    const state = loadRunState(resolve(process.cwd(), ".runs", runId));
    expect(state.steps.resolve_config?.status).toBe("success");
  });

  test("fails with structured error when dependencies are missing", async () => {
    const runId = `missing-deps-${Date.now()}`;
    createdRuns.push(runId);
    await runStep({
      cwd: process.cwd(),
      runId,
      stepId: "resolve_config",
      requestInput: {
        runId,
        projectId: "hugo-aiv-app",
        profileId: "hookAi-android-alpha",
        overrides: {},
      },
    });

    const result = await runStep({
      cwd: process.cwd(),
      runId,
      stepId: "prepare_platform_env",
    });

    expect(result.ok).toBe(false);
    expect(result.error?.stepId).toBe("prepare_platform_env");
    expect(result.error?.category).toBe("step_execution_failed");
  });
});
