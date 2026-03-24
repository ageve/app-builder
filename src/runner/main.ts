#!/usr/bin/env bun
import { Command } from "commander";
import { resolve } from "node:path";
import {
  getBuildDashboard,
  getBuildRunDetail,
  inspectConfig,
  listPipelines,
  resumeBuild,
  retryBuild,
  startBuild,
} from "../runtime/builds";

const program = new Command();

function cwdOption(value: string | undefined) {
  return value ? resolve(value) : process.cwd();
}

function triggerSourceOption(value: string | undefined) {
  if (value === "web" || value === "worker") {
    return value;
  }
  return "cli";
}

program.name("app-builder-runner").description("App builder runtime control CLI");

const build = program.command("build").description("Build runtime controls");

build
  .command("start")
  .requiredOption("--project-id <projectId>")
  .requiredOption("--profile-id <profileId>")
  .option("--run-id <runId>")
  .option("--branch <branch>")
  .option("--auto-version-code <value>")
  .option("--legacy-versioning <value>")
  .option("--trigger-source <triggerSource>")
  .option("--cwd <cwd>")
  .action(async (options) => {
    const cwd = cwdOption(options.cwd);
    const detail = await startBuild(cwd, {
      projectId: options.projectId,
      profileId: options.profileId,
      runId: options.runId,
      overrides: {
        branch: options.branch,
        autoVersionCode:
          options.autoVersionCode === undefined
            ? undefined
            : options.autoVersionCode === "true",
        legacyVersioning:
          options.legacyVersioning === undefined
            ? undefined
            : options.legacyVersioning === "true",
      },
      triggerSource: triggerSourceOption(options.triggerSource),
    });
    console.log(JSON.stringify(detail, null, 2));
  });

build
  .command("resume")
  .requiredOption("--run-id <runId>")
  .requiredOption("--from-step <fromStep>")
  .option("--trigger-source <triggerSource>")
  .option("--cwd <cwd>")
  .action(async (options) => {
    const cwd = cwdOption(options.cwd);
    const detail = await resumeBuild(cwd, {
      runId: options.runId,
      fromStep: options.fromStep,
      triggerSource: triggerSourceOption(options.triggerSource),
    });
    console.log(JSON.stringify(detail, null, 2));
  });

build
  .command("retry")
  .requiredOption("--run-id <runId>")
  .requiredOption("--step <step>")
  .option("--trigger-source <triggerSource>")
  .option("--cwd <cwd>")
  .action(async (options) => {
    const cwd = cwdOption(options.cwd);
    const detail = await retryBuild(cwd, {
      runId: options.runId,
      stepId: options.step,
      triggerSource: triggerSourceOption(options.triggerSource),
    });
    console.log(JSON.stringify(detail, null, 2));
  });

build
  .command("inspect-config")
  .requiredOption("--project-id <projectId>")
  .requiredOption("--profile-id <profileId>")
  .option("--run-id <runId>")
  .option("--branch <branch>")
  .option("--auto-version-code <value>")
  .option("--legacy-versioning <value>")
  .option("--cwd <cwd>")
  .action((options) => {
    const cwd = cwdOption(options.cwd);
    const resolvedConfig = inspectConfig(cwd, {
      projectId: options.projectId,
      profileId: options.profileId,
      runId: options.runId,
      overrides: {
        branch: options.branch,
        autoVersionCode:
          options.autoVersionCode === undefined
            ? undefined
            : options.autoVersionCode === "true",
        legacyVersioning:
          options.legacyVersioning === undefined
            ? undefined
            : options.legacyVersioning === "true",
      },
    });
    console.log(JSON.stringify(resolvedConfig, null, 2));
  });

build
  .command("list-pipelines")
  .option("--project-id <projectId>")
  .option("--cwd <cwd>")
  .action((options) => {
    const cwd = cwdOption(options.cwd);
    const pipelines = listPipelines(cwd, options.projectId);
    console.log(JSON.stringify(pipelines, null, 2));
  });

build
  .command("runs")
  .option("--cwd <cwd>")
  .action(async (options) => {
    const cwd = cwdOption(options.cwd);
    const dashboard = await getBuildDashboard(cwd);
    console.log(JSON.stringify(dashboard, null, 2));
  });

build
  .command("run-detail")
  .requiredOption("--run-id <runId>")
  .option("--cwd <cwd>")
  .action(async (options) => {
    const cwd = cwdOption(options.cwd);
    const detail = await getBuildRunDetail(cwd, options.runId);
    console.log(JSON.stringify(detail, null, 2));
  });

program.parseAsync(process.argv);
