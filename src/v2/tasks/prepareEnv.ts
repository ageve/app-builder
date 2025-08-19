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
  autoVersionCode?: boolean,
  legacyVersioning?: boolean
) {
  try {
    log.info(context.workspace);
    const { workspace, logger, variables, env } = context;

    // 读取预设 envFile 内容
    const envContent = dotEnvToJson(readFileSync(envFile, "utf-8"));

    const versionCode = envContent["EXPO_PUBLIC_VERSION_CODE"];
    const legacyVersionName = envContent["EXPO_PUBLIC_VERSION_NAME"];
    
    // Use commit hash as build number from variables
    const newBuildNumber = variables?.commitCount;

    // Only increment version code for production environment by default
    const shouldIncrementVersionCode = autoVersionCode !== undefined 
      ? autoVersionCode 
      : env === "production";

    const newVersionCode = shouldIncrementVersionCode
      ? String(Number(envContent["EXPO_PUBLIC_VERSION_CODE"]) + 1)
      : envContent["EXPO_PUBLIC_VERSION_CODE"];
    
    let newVersionName;
    
    // Backward compatibility: use legacy version name if provided
    if (legacyVersioning) {
      log.info(`In legacy versioning mode, using version name from env: ${legacyVersionName}`);
      newVersionName = legacyVersionName;
    } else {
      // Convert newVersionCode to semantic version
      const currentVersionCode = Number(newVersionCode);
      log.info(`Parsing version code: ${currentVersionCode}`);
      
      let major, minor, patch;
      // format: 101002 -> 1.1.2
      major = Math.floor(currentVersionCode / 100000);
      minor = Math.floor((currentVersionCode % 100000) / 1000);
      patch = currentVersionCode % 1000;
      
      const semanticVersion = `${major}.${minor}.${patch}`;
      
      newVersionName = `${semanticVersion}.${newBuildNumber}`;
      log.info(`Generated version name: ${newVersionName}`);
    }

    envContent["EXPO_PUBLIC_VERSION_CODE"] = newVersionCode;
    envContent["EXPO_PUBLIC_VERSION_NAME"] = newVersionName;

    log.info(`environment: ${env} (version code increment: ${shouldIncrementVersionCode})`);
    log.info(`versionCode: ${versionCode} -> ${newVersionCode}${shouldIncrementVersionCode ? ' (incremented)' : ' (unchanged)'}`);
    log.info(`buildNumber: ${newBuildNumber}`);
    log.info(`versionName: ${newVersionName}`);

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
      versionCode: newVersionCode,
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
  autoVersionCode = false,
  legacyVersioning = false
) {
  const task = (context: any) =>
    prepareEnv(context, envFile, autoVersionCode, legacyVersioning);
  setTaskName("prepareEnv", task);
  return task;
}
