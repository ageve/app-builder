import { log } from "@clack/prompts";
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
    const { workspace, logger, variables } = context;

    // 读取预设 envFile 内容
    const envContent = dotEnvToJson(readFileSync(envFile, "utf-8"));

    const versionCode = envContent["EXPO_PUBLIC_VERSION_CODE"];
    const legacyVersionName = envContent["EXPO_PUBLIC_VERSION_NAME"];
    
    // Use commit hash as build number from variables
    const newBuildNumber = variables?.commitCount;

    const newVersionCode = incrementVersionCode
      ? String(Number(envContent["EXPO_PUBLIC_VERSION_CODE"]) + 1)
      : envContent["EXPO_PUBLIC_VERSION_CODE"];
    
    let newVersionName;
    
    // Backward compatibility: use legacy version name if provided
    if (legacyVersionName) {
      newVersionName = legacyVersionName;
      log.info(`Using legacy version name: ${legacyVersionName}`);
    } else {
      // Convert newVersionCode to semantic version (e.g., 1001002 -> 1.1.2)
      const currentVersionCode = Number(newVersionCode);
      const major = Math.floor(currentVersionCode / 1000000);
      const minor = Math.floor((currentVersionCode % 1000000) / 1000);
      const patch = currentVersionCode % 1000;
      const semanticVersion = `${major}.${minor}.${patch}`;
      
      newVersionName = `${semanticVersion}.${newBuildNumber}`;
      log.info(`Generated version name: ${newVersionName}`);
    }

    envContent["EXPO_PUBLIC_VERSION_CODE"] = newVersionCode;

    log.info(`versionName: ${newVersionName}`);
    log.info(`versionCode: ${versionCode} -> ${newVersionCode}`);
    log.info(`buildNumber: ${newBuildNumber}`);

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
      versionName: newVersionName,
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
  incrementVersionCode = false
) {
  const task = (context: any) =>
    prepareEnv(context, envFile, incrementVersionCode);
  setTaskName("prepareEnv", task);
  return task;
}
