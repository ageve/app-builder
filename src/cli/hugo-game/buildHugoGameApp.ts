import Enquirer from "enquirer";
import { readdirSync } from "fs-extra";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { rimraf } from "rimraf";
import updatePackage from "../../v2/custom/updatePackage";
import uploadQiniu from "../../v2/custom/uploadQiniu";
import Pipeline from "../../v2/pipeline";
import { pipelineRun } from "../../v2/pipelineRun";
import createBuildAndroid from "../../v2/tasks/buildAndroid";
import createNotifyBusinessWechat from "../../v2/tasks/notifyBusinessWechat";
import prepareCode from "../../v2/tasks/prepareCode";
import prepareDependencies from "../../v2/tasks/prepareDependencies";
import createPrepareEnv from "../../v2/tasks/prepareEnv";
import prepareVar from "../../v2/tasks/prepareVar";
import renameLog from "../../v2/tasks/renameLog";
import createUploadFir from "../../v2/tasks/uploadFir";
import createUploadPgyer from "../../v2/tasks/uploadPgyer";
import { Task } from "../../v2/types";
import tasksParallel from "../../v2/utils/tasksParallel";
import config from "./config.example";
const pipelineGroup = [
  "production",
  "alpha",
  "debug",
  "custom-production",
  "custom-alpha",
] as const;
type PipelineGroup = (typeof pipelineGroup)[number];
const enquirer = new Enquirer<{ pipelineGroup: PipelineGroup }>();

const envs = readdirSync(resolve(cwd(), "./envs/hugo-game-app"))
  .filter((it) => it.includes(".env"))
  .sort()
  .map((it) => ({
    name: it,
    path: resolve(cwd(), "./envs/hugo-game-app", it),
  }));

const productionEnvs = envs.filter((it) => /.prod/.test(it.name));

const alphaEnvs = envs.filter((it) => it.name.includes(".alpha"));

export async function buildHugoGameApp() {
  const result = await enquirer.prompt({
    type: "select",
    name: "pipelineGroup",
    message: "select a pipelineGroup",
    choices: pipelineGroup as unknown as string[],
  });
  switch (result.pipelineGroup) {
    case "debug":
      buildDebugPipelineGroup();
      break;
    case "alpha":
    case "production":
      buildAlphaOrProdPipelineGroup({ type: result.pipelineGroup });
      break;

    default:
      buildCustomPipelineGroup(result.pipelineGroup);
      break;
  }
}

function buildDebugPipelineGroup() {
  // 本地使用额外处理: 请确认本地项目路径和构建脚本的路径
  const workspace = resolve(cwd(), `../hugo-game-app`);
  rimraf(resolve(cwd(), "./build/hugo-game-app"));
  pipelineRun([
    // @ts-ignore
    new Pipeline({ gitUri: config!.gitUir, branch: "debug", workspace }, [
      prepareVar,
      createPrepareEnv(resolve(workspace, "./.env")),
      createBuildAndroid({ clean: false }),
      createUploadPgyer(config!.pgyer),
      createNotifyBusinessWechat(config!.notifyBusinessWechat.webhook),
      renameLog,
    ]),
  ]);
}

function buildAlphaOrProdPipelineGroup({
  type,
  customEnvs,
}: {
  type: Pick<PipelineGroup, "alpha" & "production">;
  customEnvs?: { name: string; path: string }[];
}) {
  const envs = customEnvs
    ? customEnvs
    : type === "production"
    ? productionEnvs
    : alphaEnvs;
  const branch = type === "production" ? "master" : "alpha";
  rimraf(resolve(cwd(), "./build/hugo-game-app"));
  pipelineRun(
    envs.map((it, index) => {
      const tasks: Task[] =
        index === 0 ? [prepareCode, prepareDependencies] : [];
      const clean = index === 0;
      // 生产环境同时上传 fir
      const uploadTasks =
        type === "production"
          ? [uploadQiniu, createUploadFir(config!.fir.apiKey, "android")]
          : [uploadQiniu];

      // @ts-ignore
      return new Pipeline({ gitUri: config!.gitUir, branch }, [
        ...tasks,
        prepareVar,
        createPrepareEnv(it.path),
        createBuildAndroid({ clean: clean }),
        tasksParallel(uploadTasks),
        updatePackage,
        createNotifyBusinessWechat(config!.notifyBusinessWechat.webhook),
      ]);
    })
  );
}

async function buildCustomPipelineGroup(
  type: Pick<PipelineGroup, "custom-alpha" & "custom-production">
) {
  const envs = type === "custom-production" ? productionEnvs : alphaEnvs;
  const en2 = new Enquirer<{ customPipeline: string[] }>();
  const result = await en2.prompt({
    type: "multiselect",
    name: "customPipeline",
    message: "customize pipeline group",
    choices: envs.map((it) => it.name),
  });
  console.log(result.customPipeline);
  if (result.customPipeline && result.customPipeline.length > 0) {
    const customEnvs = envs.filter((it) =>
      result.customPipeline.includes(it.name)
    );
    console.log(envs, customEnvs);

    buildAlphaOrProdPipelineGroup({
      customEnvs,
      type: (type as string).replace("custom-", ""),
    });
  }
}
