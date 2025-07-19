import { log } from "@clack/prompts";
import { readFileSync, writeFileSync } from "fs-extra";
import { resolve } from "node:path";
import { dotEnvToJson, jsonToDotEnv, setTaskName } from "../utils/common";
export async function prepareEnvProperties(
  context: any,
  envPropertiesFile: string
) {
  // 检查文件夹是否存在，否创建
  try {
    const { prepareEnv, workspace } = context;
    const { envContent } = prepareEnv;

    // 读取预设 envFile 内容
    const envPropertiesContent = dotEnvToJson(
      readFileSync(envPropertiesFile, "utf-8")
    );
    // 从 env 环境变量同步公共配置到 android 的 env.properties
    Object.keys(envContent).forEach((key) => {
      const value = envContent[key];
      const newKey = key.replace("EXPO_PUBLIC", "");
      if (newKey in envPropertiesContent) {
        envPropertiesContent[newKey] = value;
      }
    });

    const newEnvPropertiesContent = jsonToDotEnv(envPropertiesContent);
    const envPropertiesFileBuild = resolve(
      workspace,
      "./android/env.properties"
    );
    writeFileSync(envPropertiesFileBuild, newEnvPropertiesContent, "utf-8");

    return true;
  } catch (error) {
    if (error instanceof Error) {
      log.error("prepare Android env.properties failed " + error.message);
    }
  }
  return false;
}

export default function createPrepareEnvProperties(envPropertiesFile: string) {
  const task = (context: any) =>
    prepareEnvProperties(context, envPropertiesFile);
  setTaskName("prepareEnvProperties", task);
  return task;
}
