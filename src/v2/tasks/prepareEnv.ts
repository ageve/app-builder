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
async function prepareEnv(
  context: any,
  envFile: string,
  incrementVersionCode?: boolean
) {
  try {
    log.info(context.workspace);
    const { workspace, logger } = context;

    const packageJSON = JSON.parse(
      readFileSync(resolve(workspace, "./package.json"), "utf-8")
    );
    // 读取预设 envFile 内容
    const envContent = dotEnvToJson(readFileSync(envFile, "utf-8"));

    const versionName = envContent["EXPO_PUBLIC_VERSION_NAME"];
    const versionCode = envContent["EXPO_PUBLIC_VERSION_CODE"];

    const newVersionName = `${packageJSON.version}.${dayjs().format(
      "YYMMDDHH"
    )}`;

    const newVersionCode = incrementVersionCode
      ? String(Number(envContent["EXPO_PUBLIC_VERSION_CODE"]) + 1)
      : envContent["EXPO_PUBLIC_VERSION_CODE"];

    envContent["EXPO_PUBLIC_VERSION_NAME"] = newVersionName;
    envContent["EXPO_PUBLIC_VERSION_CODE"] = newVersionCode;

    log.info(`versionName: ${versionName} -> ${newVersionName}`);
    log.info(`versionCode: ${versionCode} -> ${newVersionCode}`);

    log.info(`env ${JSON.stringify(envContent, null, 2)}`);

    const newEnvContent = jsonToDotEnv(envContent);
    // build 时环境变量文件
    const envFileCache = resolve(workspace, "./.env");
    writeFileSync(envFileCache, newEnvContent, "utf-8");
    writeFileSync(envFile, newEnvContent, "utf-8");

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
      log.error("Failed to set environment variable, " + error.message);
    }
  }
  return false;
}

export default function createPrepareEnv(
  envFile: string,
  incrementVersionCode = true
) {
  const task = (context: any) =>
    prepareEnv(context, envFile, incrementVersionCode);
  setTaskName("prepareEnv", task);
  return task;
}
