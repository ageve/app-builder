#!/usr/bin/env bun
import { Command } from "commander";
import { resolve } from "node:path";
import { adaptPipelineRunContextToCwd } from "../runtime/config";
import { getOrderedStepsForPlatform } from "../runtime/definitions";
import { runStepWithPersistence, StepPersistence } from "../runtime/steps";
import { PipelineRunDetail, StepId, UploadRecord } from "../runtime/types";

const program = new Command();
let activeRun:
  | {
      runtimeUrl: string;
      runId: string;
      stepId: StepId;
    }
  | undefined;
let isCleaningUp = false;

function cwdOption(value: string | undefined) {
  return value ? resolve(value) : process.cwd();
}

function runtimeUrlOption(value: string | undefined) {
  return value ?? process.env.APP_BUILDER_RUNTIME_URL ?? "http://127.0.0.1:4001";
}

async function runtimeFetch<T>(
  runtimeUrl: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${runtimeUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 204) {
    return null as T;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `runtime request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function createRemotePersistence(
  runtimeUrl: string,
  cwd: string
): StepPersistence {
  const adaptDetail = (detail: PipelineRunDetail | null) => {
    if (!detail) {
      return null;
    }
    const adaptedContext = adaptPipelineRunContextToCwd(cwd, detail.context);
    return {
      ...detail,
      context: adaptedContext,
      artifacts: detail.artifacts.map((artifact) => ({
        ...artifact,
        path: artifact.path.replace(detail.context.resolvedConfig.defaults.rootCwd, cwd),
      })),
      uploads: detail.uploads.map((upload) => ({
        ...upload,
        artifactPath: upload.artifactPath.replace(
          detail.context.resolvedConfig.defaults.rootCwd,
          cwd
        ),
      })),
      steps: detail.steps.map((step) => ({
        ...step,
        artifacts: step.artifacts.map((artifact) => ({
          ...artifact,
          path: artifact.path.replace(detail.context.resolvedConfig.defaults.rootCwd, cwd),
        })),
      })),
    } satisfies PipelineRunDetail;
  };

  return {
    async getRunDetail(runId) {
      const detail = await runtimeFetch<PipelineRunDetail | null>(
        runtimeUrl,
        `/api/builds/${runId}`
      );
      return adaptDetail(detail);
    },
    async syncStep(runId, step, stepOrder, context, artifacts) {
      await runtimeFetch(
        runtimeUrl,
        `/api/executor/runs/${runId}/steps/${step.stepId}/sync`,
        {
          method: "POST",
          body: JSON.stringify({
            step,
            stepOrder,
            context,
            artifacts,
          }),
        }
      );
    },
    findUploadRecordByKey(idempotencyKey) {
      return runtimeFetch<UploadRecord | undefined>(
        runtimeUrl,
        `/api/executor/upload-records/${encodeURIComponent(idempotencyKey)}`
      );
    },
    async insertUploadRecord(runId, record) {
      await runtimeFetch(runtimeUrl, `/api/executor/runs/${runId}/upload-records`, {
        method: "POST",
        body: JSON.stringify({ record }),
      });
    },
  };
}

async function markCurrentStep(runtimeUrl: string, runId: string, stepId?: StepId) {
  await runtimeFetch(runtimeUrl, `/api/executor/runs/${runId}/current-step`, {
    method: "POST",
    body: JSON.stringify({ stepId: stepId ?? null }),
  });
}

async function markRunSuccessRemote(runtimeUrl: string, runId: string) {
  await runtimeFetch(runtimeUrl, `/api/executor/runs/${runId}/success`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

async function markRunFailureRemote(
  runtimeUrl: string,
  runId: string,
  stepId: StepId,
  message: string,
  category: string
) {
  await runtimeFetch(runtimeUrl, `/api/executor/runs/${runId}/failure`, {
    method: "POST",
    body: JSON.stringify({
      stepId,
      message,
      category,
    }),
  });
}

async function failActiveRun(
  message: string,
  category = "executor_interrupted"
) {
  if (!activeRun || isCleaningUp) {
    return;
  }

  isCleaningUp = true;
  try {
    await markRunFailureRemote(
      activeRun.runtimeUrl,
      activeRun.runId,
      activeRun.stepId,
      message,
      category
    );
  } catch (error) {
    console.error(error);
  } finally {
    activeRun = undefined;
    isCleaningUp = false;
  }
}

async function claimNextRun(runtimeUrl: string, cwd: string) {
  const detail = await runtimeFetch<PipelineRunDetail | null>(
    runtimeUrl,
    "/api/executor/claim",
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );

  if (!detail) {
    return null;
  }

  const adaptedContext = adaptPipelineRunContextToCwd(cwd, detail.context);
  return {
    ...detail,
    context: adaptedContext,
  } satisfies PipelineRunDetail;
}

async function workOnce(runtimeUrl: string, cwd: string) {
  const detail = await claimNextRun(runtimeUrl, cwd);
  if (!detail) {
    return null;
  }

  const orderedSteps = getOrderedStepsForPlatform(detail.definition.pipeline.platform);
  const firstStep = detail.run.requestedStepId ?? orderedSteps[0];
  const startIndex = orderedSteps.findIndex((stepId) => stepId === firstStep);
  if (startIndex === -1) {
    throw new Error(`unknown start step: ${firstStep}`);
  }

  const persistence = createRemotePersistence(runtimeUrl, cwd);
  let lastStepId: StepId | undefined;
  const results: Array<{ stepId: StepId; status: string }> = [];

  for (const stepId of orderedSteps.slice(startIndex)) {
    lastStepId = stepId;
    activeRun = {
      runtimeUrl,
      runId: detail.run.runId,
      stepId,
    };
    await markCurrentStep(runtimeUrl, detail.run.runId, stepId);
    const result = await runStepWithPersistence({
      persistence,
      runId: detail.run.runId,
      stepId,
    });
    results.push({ stepId: result.stepId, status: result.status });
    if (!result.ok) {
      await markRunFailureRemote(
        runtimeUrl,
        detail.run.runId,
        result.stepId,
        result.error?.message ?? "step execution failed",
        result.error?.category ?? "step_execution_failed"
      );
      activeRun = undefined;
      return {
        ok: false,
        runId: detail.run.runId,
        stepId: result.stepId,
        status: result.status,
      };
    }
  }

  await markRunSuccessRemote(runtimeUrl, detail.run.runId);
  await markCurrentStep(runtimeUrl, detail.run.runId, undefined);
  activeRun = undefined;
  return {
    ok: true,
    runId: detail.run.runId,
    stepId: lastStepId,
    status: "success",
    results,
  };
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void failActiveRun(`executor interrupted by ${signal.toLowerCase()}`).finally(() => {
      process.exit(1);
    });
  });
}

process.on("uncaughtException", (error) => {
  console.error(error);
  void failActiveRun(error.message || "uncaught exception", "executor_uncaught_exception").finally(
    () => {
      process.exit(1);
    }
  );
});

process.on("unhandledRejection", (reason) => {
  console.error(reason);
  const message =
    reason instanceof Error ? reason.message : `unhandled rejection: ${String(reason)}`;
  void failActiveRun(message, "executor_unhandled_rejection").finally(() => {
    process.exit(1);
  });
});

program.name("app-builder-executor").description("Local executor for app-builder runs");

program
  .command("work")
  .option("--runtime-url <runtimeUrl>")
  .option("--cwd <cwd>")
  .option("--once", "Process a single available run and exit", false)
  .option("--poll-interval-ms <value>", "Polling interval in milliseconds", "3000")
  .action(async (options) => {
    const runtimeUrl = runtimeUrlOption(options.runtimeUrl);
    const cwd = cwdOption(options.cwd);
    const interval = Number(options.pollIntervalMs ?? 3000);

    if (options.once) {
      const result = await workOnce(runtimeUrl, cwd);
      if (result) {
        console.log(JSON.stringify(result, null, 2));
        process.exitCode = result.ok ? 0 : 1;
      }
      return;
    }

    while (true) {
      try {
        const result = await workOnce(runtimeUrl, cwd);
        if (result) {
          console.log(JSON.stringify(result, null, 2));
        }
      } catch (error) {
        console.error(error);
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, interval));
    }
  });

program.parseAsync(process.argv);
