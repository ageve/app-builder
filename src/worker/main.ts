#!/usr/bin/env bun
import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  claimNextBuildRun,
  getBuildDashboard,
  getBuildRunDetail,
  getPipelineConfigDocument,
  getPipelineDetail,
  getWorkspaceConfigDocument,
  getWorkspaceDetail,
  inspectConfig,
  listPipelines,
  listWorkspaces,
  markRunFailed,
  markRunStep,
  markRunSuccess,
  recoverStaleRunningRuns,
  resumeBuild,
  retryBuild,
  savePipelineConfigDocument,
  saveWorkspaceConfigDocument,
  startBuild,
} from "../runtime/builds";
import { executeRun } from "../runtime/steps";
import {
  findUploadRecordByKey,
  insertUploadRecord,
  replaceArtifactsForStep,
  savePipelineRunContext,
  updateStepState,
} from "../runtime/store";
import { Artifact, PipelineRunContextSchema, StepStateSchema, UploadRecordSchema } from "../runtime/types";

const program = new Command();

function cwdOption(value: string | undefined) {
  return value ? resolve(value) : process.cwd();
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

function textResponse(message: string, status = 500) {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

async function workOnce(cwd: string) {
  const next = await claimNextBuildRun(cwd);
  if (!next) {
    return null;
  }

  const result = await executeRun(cwd, next.runId, next.requestedStepId);
  if (result.ok) {
    await markRunSuccess(cwd, next.runId);
    await markRunStep(cwd, next.runId, undefined);
  } else {
    await markRunFailed(
      cwd,
      next.runId,
      result.stepId,
      result.error?.message ?? "step execution failed",
      result.error?.category ?? "step_execution_failed"
    );
  }

  return result;
}

async function startPolling(cwd: string, interval: number) {
  while (true) {
    try {
      const result = await workOnce(cwd);
      if (result) {
        console.log(
          JSON.stringify(
            {
              runId: result.runId,
              stepId: result.stepId,
              ok: result.ok,
              status: result.status,
            },
            null,
            2
          )
        );
      }
    } catch (error) {
      console.error(error);
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, interval));
  }
}

async function handleRequest(request: Request, cwd: string) {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (request.method === "GET" && path === "/health") {
      return jsonResponse({ ok: true });
    }

    if (request.method === "GET" && path === "/api/pipelines") {
      return jsonResponse(listPipelines(cwd));
    }

    if (request.method === "GET" && path === "/api/workspaces") {
      return jsonResponse(listWorkspaces(cwd));
    }

    if (request.method === "POST" && path === "/api/config/inspect") {
      const body = (await request.json()) as {
        projectId: string;
        profileId: string;
        branch?: string;
        autoVersionCode?: boolean;
        legacyVersioning?: boolean;
        runtimeConfig?: Record<string, unknown>;
      };
      return jsonResponse(
        inspectConfig(cwd, {
          projectId: body.projectId,
          profileId: body.profileId,
          overrides: {
            branch: body.branch,
            autoVersionCode: body.autoVersionCode,
            legacyVersioning: body.legacyVersioning,
            runtimeConfig: body.runtimeConfig,
          },
        })
      );
    }

    if (request.method === "GET" && path === "/api/builds") {
      return jsonResponse(await getBuildDashboard(cwd));
    }

    if (request.method === "POST" && path === "/api/builds/start") {
      const body = (await request.json()) as {
        projectId: string;
        profileId: string;
        branch?: string;
        autoVersionCode?: boolean;
        legacyVersioning?: boolean;
        runtimeConfig?: Record<string, unknown>;
      };
      return jsonResponse(
        await startBuild(cwd, {
          projectId: body.projectId,
          profileId: body.profileId,
          overrides: {
            branch: body.branch,
            autoVersionCode: body.autoVersionCode,
            legacyVersioning: body.legacyVersioning,
            runtimeConfig: body.runtimeConfig,
          },
          triggerSource: "web",
        })
      );
    }

    const workspaceMatch = path.match(/^\/api\/workspaces\/([^/]+)$/);
    if (request.method === "GET" && workspaceMatch) {
      const workspaceId = decodeURIComponent(workspaceMatch[1]!);
      return jsonResponse(await getWorkspaceDetail(cwd, workspaceId));
    }

    const workspaceConfigMatch = path.match(/^\/api\/workspaces\/([^/]+)\/config$/);
    if (request.method === "GET" && workspaceConfigMatch) {
      const workspaceId = decodeURIComponent(workspaceConfigMatch[1]!);
      return jsonResponse(getWorkspaceConfigDocument(cwd, workspaceId));
    }

    if (request.method === "PUT" && workspaceConfigMatch) {
      const workspaceId = decodeURIComponent(workspaceConfigMatch[1]!);
      const body = (await request.json()) as { content: string };
      return jsonResponse(saveWorkspaceConfigDocument(cwd, workspaceId, body.content));
    }

    const workspacePipelinesMatch = path.match(/^\/api\/workspaces\/([^/]+)\/pipelines$/);
    if (request.method === "GET" && workspacePipelinesMatch) {
      const workspaceId = decodeURIComponent(workspacePipelinesMatch[1]!);
      return jsonResponse(listPipelines(cwd, workspaceId));
    }

    const pipelineMatch = path.match(
      /^\/api\/workspaces\/([^/]+)\/pipelines\/([^/]+)$/
    );
    if (request.method === "GET" && pipelineMatch) {
      const workspaceId = decodeURIComponent(pipelineMatch[1]!);
      const pipelineId = decodeURIComponent(pipelineMatch[2]!);
      const detail = await getPipelineDetail(cwd, workspaceId, pipelineId);
      return jsonResponse(detail, detail ? 200 : 404);
    }

    const pipelineConfigMatch = path.match(
      /^\/api\/workspaces\/([^/]+)\/pipelines\/([^/]+)\/config$/
    );
    if (request.method === "GET" && pipelineConfigMatch) {
      const pipelineId = decodeURIComponent(pipelineConfigMatch[2]!);
      return jsonResponse(getPipelineConfigDocument(cwd, pipelineId));
    }

    if (request.method === "PUT" && pipelineConfigMatch) {
      const pipelineId = decodeURIComponent(pipelineConfigMatch[2]!);
      const body = (await request.json()) as { content: string };
      return jsonResponse(savePipelineConfigDocument(cwd, pipelineId, body.content));
    }

    const buildMatch = path.match(/^\/api\/builds\/([^/]+)$/);
    if (request.method === "GET" && buildMatch) {
      const detail = await getBuildRunDetail(cwd, decodeURIComponent(buildMatch[1]!));
      return jsonResponse(detail, detail ? 200 : 404);
    }

    const logMatch = path.match(/^\/api\/builds\/([^/]+)\/logs$/);
    if (request.method === "GET" && logMatch) {
      const runId = decodeURIComponent(logMatch[1]!);
      const detail = await getBuildRunDetail(cwd, runId);
      if (!detail) {
        return jsonResponse({ content: "", logFile: "" }, 404);
      }
      const logFile = detail.context.logFile;
      if (!logFile || !existsSync(logFile)) {
        return jsonResponse({ content: "", logFile });
      }
      const content = readFileSync(logFile, "utf-8");
      return jsonResponse({
        content: content.split("\n").slice(-120).join("\n"),
        logFile,
      });
    }

    const resumeMatch = path.match(/^\/api\/builds\/([^/]+)\/resume$/);
    if (request.method === "POST" && resumeMatch) {
      const body = (await request.json()) as { fromStep: string };
      return jsonResponse(
        await resumeBuild(cwd, {
          runId: decodeURIComponent(resumeMatch[1]!),
          fromStep: body.fromStep as never,
          triggerSource: "web",
        })
      );
    }

    const retryMatch = path.match(/^\/api\/builds\/([^/]+)\/retry$/);
    if (request.method === "POST" && retryMatch) {
      const body = (await request.json()) as { stepId: string };
      return jsonResponse(
        await retryBuild(cwd, {
          runId: decodeURIComponent(retryMatch[1]!),
          stepId: body.stepId as never,
          triggerSource: "web",
        })
      );
    }

    if (request.method === "POST" && path === "/api/executor/claim") {
      const run = await claimNextBuildRun(cwd);
      if (!run) {
        return new Response(null, { status: 204 });
      }
      return jsonResponse(await getBuildRunDetail(cwd, run.runId));
    }

    const currentStepMatch = path.match(/^\/api\/executor\/runs\/([^/]+)\/current-step$/);
    if (request.method === "POST" && currentStepMatch) {
      const body = (await request.json()) as { stepId?: string | null };
      await markRunStep(
        cwd,
        decodeURIComponent(currentStepMatch[1]!),
        body.stepId ? (body.stepId as never) : undefined
      );
      return jsonResponse({ ok: true });
    }

    const successMatch = path.match(/^\/api\/executor\/runs\/([^/]+)\/success$/);
    if (request.method === "POST" && successMatch) {
      await markRunSuccess(cwd, decodeURIComponent(successMatch[1]!));
      await markRunStep(cwd, decodeURIComponent(successMatch[1]!), undefined);
      return jsonResponse({ ok: true });
    }

    const failureMatch = path.match(/^\/api\/executor\/runs\/([^/]+)\/failure$/);
    if (request.method === "POST" && failureMatch) {
      const body = (await request.json()) as {
        stepId: string;
        message: string;
        category: string;
      };
      await markRunFailed(
        cwd,
        decodeURIComponent(failureMatch[1]!),
        body.stepId as never,
        body.message,
        body.category
      );
      return jsonResponse({ ok: true });
    }

    const stepSyncMatch = path.match(/^\/api\/executor\/runs\/([^/]+)\/steps\/([^/]+)\/sync$/);
    if (request.method === "POST" && stepSyncMatch) {
      const body = (await request.json()) as {
        step: unknown;
        stepOrder: number;
        context: unknown;
        artifacts: unknown;
      };
      const step = StepStateSchema.parse(body.step);
      const context = PipelineRunContextSchema.parse(body.context);
      const artifacts = Array.isArray(body.artifacts)
        ? body.artifacts.map((artifact) => artifact as Artifact)
        : [];
      await savePipelineRunContext(cwd, context);
      await updateStepState(cwd, decodeURIComponent(stepSyncMatch[1]!), step, body.stepOrder);
      await replaceArtifactsForStep(
        cwd,
        decodeURIComponent(stepSyncMatch[1]!),
        decodeURIComponent(stepSyncMatch[2]!) as never,
        artifacts
      );
      return jsonResponse({ ok: true });
    }

    const uploadFindMatch = path.match(/^\/api\/executor\/upload-records\/([^/]+)$/);
    if (request.method === "GET" && uploadFindMatch) {
      return jsonResponse(
        await findUploadRecordByKey(cwd, decodeURIComponent(uploadFindMatch[1]!))
      );
    }

    const uploadInsertMatch = path.match(/^\/api\/executor\/runs\/([^/]+)\/upload-records$/);
    if (request.method === "POST" && uploadInsertMatch) {
      const body = (await request.json()) as { record: unknown };
      const record = UploadRecordSchema.parse(body.record);
      await insertUploadRecord(cwd, decodeURIComponent(uploadInsertMatch[1]!), record);
      return jsonResponse({ ok: true });
    }

    return textResponse("Not Found", 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return textResponse(message, 500);
  }
}

program
  .name("app-builder-runtime")
  .description("Runtime state/data server for app-builder runs");

program
  .command("work")
  .option("--cwd <cwd>")
  .option("--once", "Process a single available run and exit", false)
  .option("--poll-interval-ms <value>", "Polling interval in milliseconds", "3000")
  .action(async (options) => {
    const cwd = cwdOption(options.cwd);
    const interval = Number(options.pollIntervalMs ?? 3000);
    if (options.once) {
      const result = await workOnce(cwd);
      if (result) {
        console.log(JSON.stringify(result, null, 2));
        process.exitCode = result.ok ? 0 : 1;
      }
      return;
    }

    await startPolling(cwd, interval);
  });

program
  .command("serve")
  .option("--cwd <cwd>")
  .option("--host <host>", "Host to bind", "0.0.0.0")
  .option("--port <port>", "Port to bind", "4001")
  .action(async (options) => {
    const cwd = cwdOption(options.cwd);
    const host = String(options.host ?? "0.0.0.0");
    const port = Number(options.port ?? 4001);

    const recovered = await recoverStaleRunningRuns(cwd);
    if (recovered.length > 0) {
      console.log(
        JSON.stringify(
          {
            recoveredStaleRuns: recovered,
          },
          null,
          2
        )
      );
    }

    Bun.serve({
      hostname: host,
      port,
      fetch(request) {
        return handleRequest(request, cwd);
      },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          host,
          port,
          cwd,
        },
        null,
        2
      )
    );
  });

program.parseAsync(process.argv);
