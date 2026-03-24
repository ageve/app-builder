import { createUploadQiniu } from "@/v2/custom/uploadQiniu";
import { cancel, isCancel, log, multiselect } from "@clack/prompts";
import path, { resolve } from "node:path";
import { cwd } from "node:process";
import picocolors from "picocolors";
import {
  configSchema,
  importIfExistsAndValidate,
  type Config,
} from "../../utils";
import { parseAndValidateArgs } from "../../utils/parseValidateArgs";
import { Args, argsSchema } from "../../utils/zodSchemas";
import { codemodAndroid } from "../../v2/custom/codemodAndroid";
import createCopyFile from "../../v2/custom/copyFile";
import copyToFileBrowser from "../../v2/custom/copyToFileBrowser";
import createPrepareEnvConfig from "../../v2/custom/prepareEnvConfig";
import createPrepareEnvProperties from "../../v2/custom/prepareEnvProperties";
import Pipeline from "../../v2/pipeline";
import { pipelineRun } from "../../v2/pipelineRun";
import createBuildAndroid from "../../v2/tasks/buildAndroid";
import createBuildIOS from "../../v2/tasks/buildIOS";
import prepareCode from "../../v2/tasks/prepareCode";
import prepareDependencies from "../../v2/tasks/prepareDependencies";
import createPrepareEnv from "../../v2/tasks/prepareEnv";
import prepareVar from "../../v2/tasks/prepareVar";
import renameLog from "../../v2/tasks/renameLog";
import createSyncArchive from "../../v2/tasks/syncXcodeArchive";
import createUploadFir from "../../v2/tasks/uploadFir";
import createUploadPgyer from "../../v2/tasks/uploadPgyer";
import { Platform, Task } from "../../v2/types";

// 应用别名 - 系统 - 环境配置 - 代码分支
type PipelineOption = {
  alias: string;
  platform: "iOS" | "android";
  env: "alpha" | "production";
  branch: string;
};
const pipelineOptions = [
  {
    alias: "hookAi",
    platform: "android",
    env: "alpha",
    branch: "feat/upgrade-expo-54",
  },
  {
    alias: "hookAi",
    platform: "iOS",
    env: "alpha",
    branch: "feat/upgrade-expo-54",
  },
] as PipelineOption[];

export async function buildHugoAivAppUpgrade() {
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
      allowedKeys: ["autoVersionCode", "legacyVersioning"],
      description: {
        autoVersionCode:
          "Controls whether to increment versionCode automatically, default value is true.",
        legacyVersioning:
          "Controls whether to active legacy versioning strategy for backward compatibility.",
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
        value: Object.values(item).join(" - "),
        label: Object.values(item).join(" - "),
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
      const [packageAlias, platform, env, branch] = item.split(" - ");
      log.info(
        `[buildPipeline] packageAlias: ${packageAlias}, platform: ${platform}, env: ${env}, branch: ${branch}`
      );
      // const branch = env === "alpha" ? "alpha" : "main";
      const envPath = resolve(
        cwd(),
        "./envs/hugo-aiv-app",
        `.env.${packageAlias}.${env}`
      );
      // android 平台
      const envPropertiesPath = resolve(
        cwd(),
        "./envs/hugo-aiv-app",
        `.env.${packageAlias}.properties`
      );

      const envConfigPath = resolve(
        cwd(),
        "./envs/hugo-aiv-app",
        `.env.${packageAlias}.xcconfig`
      );

      // iOS 平台
      const exportOptionsPath = resolve(
        cwd(),
        "./envs/hugo-aiv-app",
        `${packageAlias}.ExportOptions.${
          env === "alpha" ? "adHoc" : "appstore"
        }.plist`
      );

      const autoVersionCode = env === "production" || args.autoVersionCode;
      const legacyVersioning = args.legacyVersioning || false;

      const agconnectFile = resolve(
        cwd(),
        "./envs/hugo-aiv-app",
        `${packageAlias}-agconnect-services.json`
      );

      const buildTasks =
        platform === "android"
          ? [
              codemodAndroid,
              createCopyFile([
                {
                  file: agconnectFile,
                  target: "./android/app/agconnect-services.json", // resolve(workspace, target)
                },
              ]),
              createBuildAndroid({ clean: true }),
              copyToFileBrowser,
            ]
          : [
              createBuildIOS({
                projectName: "aiv",
                schema: "aiv",
                buildType: "Release",
                exportOptionsPath: {
                  adHoc: resolve(
                    cwd(),
                    "./envs/hugo-aiv-app",
                    `${packageAlias}.ExportOptions.adHoc.plist`
                  ),
                  appStore: resolve(
                    cwd(),
                    "./envs/hugo-aiv-app",
                    `${packageAlias}.ExportOptions.appstore.plist`
                  ),
                },
                ipaName: "aiv",
                distributions:
                  env === "alpha" ? ["adHoc"] : ["adHoc", "appStore"],
              }),
            ];

      const tasks: Task[] = [
        prepareCode,
        prepareDependencies,
        prepareVar,
        createPrepareEnv(envPath, autoVersionCode, legacyVersioning, platform),
        platform === "android"
          ? createPrepareEnvProperties(envPropertiesPath)
          : createPrepareEnvConfig(envConfigPath),
        ...buildTasks,
      ];

      // 测试环境包上传 fir
      if (env === "alpha" && config?.fir?.apiKey) {
        tasks.push(
          createUploadFir(
            config.fir.apiKey,
            platform as Platform,
            platform === "iOS" ? "钩子AI" : ""
          )
        );
      }

      if (env === "production" && config?.pgyer?.apiKey) {
        tasks.push(createUploadPgyer(config!.pgyer, platform as Platform));
      }
      if (env === "production" && platform === "iOS") {
        tasks.push(createSyncArchive({ schema: "aiv" }));
        if (config.appStore) {
        } else {
          log.error("[buildPipeline] miss upload appStore config");
        }
      }

      if (env === "production" && platform === "android") {
        if (config.appInfo) {
          tasks.push(
            createUploadQiniu({
              key: `res/apk/{versionName}/${config.appInfo.name}-${config.appInfo.slogan}.apk`,
            })
          );
        } else {
          throw new Error("config missing appInfo");
        }
      }

      // tasks.push(renameLog({ external: platform.toLowerCase().trim() }));

      log.info(
        "[buildPipeline]tasks " + tasks.map((item) => item.name).join(" ")
      );

      // 本地使用额外处理: 请确认本地项目路径和构建脚本的路径
      const pipeline = new Pipeline(
        {
          config,
          branch,
          gitUri: config.gitUri,
          clean: true,
          env,
          workspace: resolve(
            cwd(),
            `../app-builder-cache/projects/hugo-aiv-app-upgrade`
          ),
        },
        tasks
      );
      pipeline.registerBeforeRun(async (context) => {
        await log.info("context " + JSON.stringify(context, null, 2));
      });
      pipeline.registerAfterRun(async (context) => {
        await renameLog({ external: platform.toLowerCase().trim() })(context);
      });
      return pipeline;
    })
  );
}
