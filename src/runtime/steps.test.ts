import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { getBuildRunDetail, startBuild } from "./builds";
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
    await startBuild(process.cwd(), {
      projectId: "hugo-aiv-app",
      profileId: "hookAi-android-alpha",
      runId,
      args: {},
    });
    const result = await runStep({
      cwd: process.cwd(),
      runId,
      stepId: "resolve_config",
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe("success");
    expect(existsSync(resolve(process.cwd(), ".runs", runId, "pipeline.log"))).toBe(true);
    const detail = await getBuildRunDetail(process.cwd(), runId);
    expect(detail?.steps.find((step) => step.stepId === "resolve_config")?.status).toBe(
      "success"
    );
  });

  test("fails with structured error when dependencies are missing", async () => {
    const runId = `missing-deps-${Date.now()}`;
    createdRuns.push(runId);
    await startBuild(process.cwd(), {
      projectId: "hugo-aiv-app",
      profileId: "hookAi-android-alpha",
      runId,
      args: {},
    });

    await runStep({
      cwd: process.cwd(),
      runId,
      stepId: "resolve_config",
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
