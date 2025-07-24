import { cancel, isCancel, log, multiselect } from "@clack/prompts";
import path, { resolve } from "node:path";
import { cwd } from "node:process";
import picocolors from "picocolors";
import {
  configSchema,
  importIfExistsAndValidate,
  type Config,
} from "../../utils";
import { cartesian4 } from "../../utils/common";
import { parseAndValidateArgs } from "../../utils/parseValidateArgs";
import { Args, argsSchema } from "../../utils/zodSchemas";
import { codemodAndroid } from "../../v2/custom/codemodAndroid";
import copyToFileBrowser from "../../v2/custom/copyToFileBrowser";
import createPrepareEnvProperties from "../../v2/custom/prepareEnvProperties";
import Pipeline from "../../v2/pipeline";
import { pipelineRun } from "../../v2/pipelineRun";
import createBuildAndroid from "../../v2/tasks/buildAndroid";
import prepareCode from "../../v2/tasks/prepareCode";
import prepareDependencies from "../../v2/tasks/prepareDependencies";
import createPrepareEnv from "../../v2/tasks/prepareEnv";
import prepareVar from "../../v2/tasks/prepareVar";
import renameLog from "../../v2/tasks/renameLog";
import createUploadFir from "../../v2/tasks/uploadFir";
import createUploadPgyer from "../../v2/tasks/uploadPgyer";
import { Task } from "../../v2/types";

const androidPackages = ["qin", "hookAi"]; // 包名
const applications = ["android"]; // 系统
const envs = ["alpha", "production"]; // 环境配置
const branch = ["alpha", "main"]; // 代码分支

const pipelineOptions = cartesian4(androidPackages, applications, envs, branch)
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
    const args = parseAndValidateArgs({
      schema: argsSchema,
      allowedKeys: ["versionCode"],
      description: {
        versionCode:
          "Controls whether to increment versionCode, default value is true.",
      },
    });
    log.info("args " + JSON.stringify(args));
    log.message(
      "🚨 " +
        picocolors.bgMagenta(
          "pipeline rule: [packageName]-[applicationSystem]-[envConfig]-[codeBranch]"
        )
    );
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

    await buildPipeline({ config: projectConfig!, pipelines, args });
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
  args,
}: {
  config: Config;
  pipelines: string[];
  args: Args;
}) {
  await pipelineRun(
    pipelines.map((item) => {
      const [packageAlias, system, env, branch] = item.split("-");
      // const branch = env === "alpha" ? "alpha" : "main";
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
      const incrementVersionCode = env === "production" || args.versionCode;

      const tasks: Task[] = [
        prepareCode,
        prepareDependencies,
        prepareVar,
        createPrepareEnv(envPath, incrementVersionCode),
        createPrepareEnvProperties(envPropertiesPath),
        codemodAndroid,
        createBuildAndroid({ clean: true }),
        copyToFileBrowser,
      ];

      // 测试环境包上传 fir
      if (env === "alpha" && config?.fir?.apiKey) {
        tasks.push(createUploadFir(config.fir.apiKey, "android"));
      }

      if (env === "production" && config?.pgyer?.apiKey) {
        tasks.push(createUploadPgyer(config!.pgyer));
      }

      tasks.push(renameLog);

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
