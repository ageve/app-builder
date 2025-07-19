import { cancel, isCancel, log, multiselect } from "@clack/prompts";
import path, { resolve } from "node:path";
import { cwd } from "node:process";
import {
  cartesian3,
  configSchema,
  importIfExistsAndValidate,
  type Config,
} from "../../utils";
import copyToFileBrowser from "../../v2/custom/copyToFileBrower";
import createPrepareEnvProperties from "../../v2/custom/prepareEnvProperties";
import Pipeline from "../../v2/pipeline";
import { pipelineRun } from "../../v2/pipelineRun";
import createBuildAndroid from "../../v2/tasks/buildAndroid";
import prepareCode from "../../v2/tasks/prepareCode";
import prepareDependencies from "../../v2/tasks/prepareDependencies";
import createPrepareEnv from "../../v2/tasks/prepareEnv";
import prepareVar from "../../v2/tasks/prepareVar";
import { Task } from "../../v2/types";

const androidPackages = ["qin", "hookAi"];
const applications = ["android", "iOS"];
const envs = ["alpha", "production"];

const pipelineOptions = cartesian3(androidPackages, applications, envs)
  .filter((item) => !item.includes("iOS"))
  .map((item) => item.join("-"));

export async function buildHugoAivApp() {
  try {
    const result = await importIfExistsAndValidate(
      path.resolve(__dirname, "./config.ts"),
      configSchema
    );
    let projectConfig: Config;
    if (result.isOk()) {
      projectConfig = result.value;
    }
    if (result.isErr()) {
      log.error(result.error);
      return process.exit(0);
    }
    const pipelines = await multiselect({
      message: "Select the build pipelines.",
      options: pipelineOptions.map((item) => ({
        value: item,
        label: item,
      })),
      required: true,
    });
    if (isCancel(pipelines)) {
      cancel("Operation cancelled.");
      process.exit(0);
    }

    await buildPipeline({ config: projectConfig!, pipelines });
  } catch (error) {
    if (error instanceof Error) {
      log.error("Build failed, " + error.message);
    }
    return process.exit;
  }
}

async function buildPipeline({
  config,
  pipelines,
}: {
  config: Config;
  pipelines: string[];
}) {
  await pipelineRun(
    pipelines.map((item) => {
      const [packageAlias, system, env] = item.split("-");
      const branch = env === "alpha" ? "alpha" : "main";
      const envPath = resolve(
        cwd(),
        "./envs/hugo-aiv-app",
        `.env.${packageAlias}.${env}`
      );
      const envPropertiesPath = resolve(
        cwd(),
        "./envs/hugo-aiv-app",
        `.env.${packageAlias}.properties`
      );
      const tasks: Task[] = [
        prepareCode,
        prepareDependencies,
        prepareVar,
        createPrepareEnv(envPath),
        createPrepareEnvProperties(envPropertiesPath),
        createBuildAndroid({ clean: true }),
        copyToFileBrowser,
      ];

      // 本地使用额外处理: 请确认本地项目路径和构建脚本的路径
      const pipeline = new Pipeline(
        { config, branch, gitUri: config.gitUri, clean: true, env },
        tasks
      );
      pipeline.registerBeforeRun(async (context) => {
        await log.info("context " + JSON.stringify(context, null, 2));
      });
      return pipeline;
    })
  );
}
