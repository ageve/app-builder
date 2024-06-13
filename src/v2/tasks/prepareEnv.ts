import { $ } from "zx";
import { dotEnvToJson, jsonToDotEnv, setTaskName } from "../utils/common";
import dayjs from "dayjs";
import { readFileSync, writeFileSync } from "fs-extra";
import { resolve } from "path";
async function prepareEnv(context: any, envFile: string) {
  try {
    console.warn(context.workspace);
    const { workspace, logger } = context;

    const packageJSON = JSON.parse(
      readFileSync(resolve(workspace, "./package.json"), "utf-8")
    );
    // 读取预设 envFile 内容
    const envContent = dotEnvToJson(readFileSync(envFile, "utf-8"));
    // TODO: 校验 .env
    // TODO: valid versionName
    const versionName =
      envContent.ENV_TYPE === "production"
        ? packageJSON.version
        : `${packageJSON.version}-${envContent.ENV_TYPE}`;
    const versionCode = dayjs().format("YYMMDDHH");
    const envs = {
      versionName,
      versionCode,
    };
    context.logger.info(envs);
    const newEnvContent = jsonToDotEnv({
      ...envContent,
      VERSION: versionName,
      VERSION_CODE: versionCode,
    });
    // build 时环境变量文件
    const envFileCache = resolve(workspace, "./.env.build.cache");
    writeFileSync(envFileCache, newEnvContent, "utf-8");
    const result = { ...envContent, ...envs, envFileCache };
    logger.info(result);
    return result;
  } catch (error) {
    console.log("环境变量设置失败", error);
  }
  return false;
}

export default function createPrepareEnv(envFile: string) {
  const task = (context: any) => prepareEnv(context, envFile);
  setTaskName("prepareEnv", task);
  return task;
}
