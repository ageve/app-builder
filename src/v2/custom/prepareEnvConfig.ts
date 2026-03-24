import { log } from "@clack/prompts";
import { readFileSync, writeFileSync } from "fs-extra";
import fs from "node:fs";
import { resolve } from "node:path";
import { dotEnvToJson, jsonToDotEnv, setTaskName } from "../utils/common";
export async function prepareEnvConfig(context: any, envConfigFile: string) {
  // 检查文件夹是否存在，否创建
  try {
    const { prepareEnv, workspace } = context;
    const { envContent, versionName, versionCode } = prepareEnv;

    let envPropertiesContent: Record<string, string> = {};
    if (fs.existsSync(envConfigFile)) {
      // 读取预设 envFile 内容
      envPropertiesContent = dotEnvToJson(readFileSync(envConfigFile, "utf-8"));
    }

    // 从 env 环境变量同步公共配置到 iOS 的 env.xcconfig
    Object.keys(envContent).forEach((key) => {
      const value = envContent[key];
      const newKey = key.replace("EXPO_PUBLIC_", "");
      // if (newKey in envPropertiesContent) {
      envPropertiesContent[newKey] = value;
      // }
    });

    // Ensure latest version information is saved
    if (versionName) {
      const list = versionName.split(".");
      console.log("[setting]", list);
      const text = list.slice(0, list.length - 1).join(".");
      envPropertiesContent["BUNDLE_VERSION_STRING"] = text;
      log.info(`Updated VERSION_NAME in env.xcconfig: ${versionName}`);
    }

    if (versionCode) {
      envPropertiesContent["BUNDLE_VERSION"] = versionCode;
      log.info(`Updated VERSION_CODE in env.xcconfig: ${versionCode}`);
    }

    const newEnvPropertiesContent = jsonToDotEnv(envPropertiesContent);
    const envConfigFileBuild = resolve(workspace, "./ios/env.xcconfig");
    writeFileSync(envConfigFileBuild, newEnvPropertiesContent, "utf-8");

    return true;
  } catch (error) {
    if (error instanceof Error) {
      log.error("prepare iOS env.xcconfig failed " + error.message);
    }
  }
  return false;
}

export default function createPrepareEnvConfig(envConfigFile: string) {
  const task = (context: any) => prepareEnvConfig(context, envConfigFile);
  setTaskName("prepareEnvConfig", task);
  return task;
}
