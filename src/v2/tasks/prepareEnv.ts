import { log } from "@clack/prompts";
import dayjs from "dayjs";
import { readFileSync, writeFileSync } from "fs-extra";
import { resolve } from "path";
import {
  convertExpoPublicKey,
  dotEnvToJson,
  jsonToDotEnv,
  setTaskName,
} from "../utils/common";
async function prepareEnv(context: any, envFile: string) {
  try {
    log.info(context.workspace);
    const { workspace, logger } = context;

    const packageJSON = JSON.parse(
      readFileSync(resolve(workspace, "./package.json"), "utf-8")
    );
    // 读取预设 envFile 内容
    const envContent = dotEnvToJson(readFileSync(envFile, "utf-8"));

    envContent["EXPO_PUBLIC_VERSION_NAME"] = `${
      packageJSON.version
    }.${dayjs().format("YYMMDDHH")}`;
    envContent["EXPO_PUBLIC_VERSION_CODE"] = String(
      Number(envContent["EXPO_PUBLIC_VERSION_CODE"]) + 1
    );

    log.info(`env ${JSON.stringify(envContent, null, 2)}`);

    const newEnvContent = jsonToDotEnv(envContent);
    // build 时环境变量文件
    const envFileCache = resolve(workspace, "./.env");
    writeFileSync(envFileCache, newEnvContent, "utf-8");
    const normalizeEnvVariables: Record<string, unknown> = {};
    Object.keys(envContent).forEach((key) => {
      const value = envContent[key];
      const newKey = convertExpoPublicKey(key);
      normalizeEnvVariables[newKey] = value;
    });
    const result = {
      envContent,
      envFileCache,
      ...normalizeEnvVariables,
    };
    logger.info(result);
    return result;
  } catch (error) {
    if (error instanceof Error) {
      log.error("环境变量设置失败 " + error.message);
    }
  }
  return false;
}

export default function createPrepareEnv(envFile: string) {
  const task = (context: any) => prepareEnv(context, envFile);
  setTaskName("prepareEnv", task);
  return task;
}
