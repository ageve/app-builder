import { cancel, isCancel, log, multiselect } from "@clack/prompts";
import path from "node:path";
import {
  cartesian3,
  configSchema,
  importIfExistsAndValidate,
  type Config,
} from "../../utils";
import Pipeline from "../../v2/pipeline";
import { pipelineRun } from "../../v2/pipelineRun";

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
      // 本地使用额外处理: 请确认本地项目路径和构建脚本的路径
      const pipeline = new Pipeline(
        { config, branch, gitUri: config.gitUri, clean: true },
        []
      );
      pipeline.registerBeforeRun(async (context) => {
        await log.info("context " + JSON.stringify(context, null, 2));
      });
      return pipeline;
    })
  );
}
