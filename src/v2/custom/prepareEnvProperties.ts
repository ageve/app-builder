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
    const { envContent, versionName, versionCode } = prepareEnv;

    // 读取预设 envFile 内容
    const envPropertiesContent = dotEnvToJson(
      readFileSync(envPropertiesFile, "utf-8")
    );
    
    // 从 env 环境变量同步公共配置到 android 的 env.properties
    Object.keys(envContent).forEach((key) => {
      const value = envContent[key];
      const newKey = key.replace("EXPO_PUBLIC_", "");
      // if (newKey in envPropertiesContent) {
      envPropertiesContent[newKey] = value;
      // }
    });

    // Ensure latest version information is saved
    if (versionName) {
      envPropertiesContent["VERSION_NAME"] = versionName;
      log.info(`Updated VERSION_NAME in env.properties: ${versionName}`);
    }
    
    if (versionCode) {
      envPropertiesContent["VERSION_CODE"] = versionCode;
      log.info(`Updated VERSION_CODE in env.properties: ${versionCode}`);
    }

    // Fall back to debug signing so Android pipelines can progress without
    // requiring release keystore material during integration.
    envPropertiesContent["QIN_STORE_FILE"] =
      envPropertiesContent["QIN_STORE_FILE"] ||
      resolve(workspace, "./android/app/debug.keystore");
    envPropertiesContent["QIN_STORE_PASSWORD"] =
      envPropertiesContent["QIN_STORE_PASSWORD"] || "android";
    envPropertiesContent["QIN_KEY_ALIAS"] =
      envPropertiesContent["QIN_KEY_ALIAS"] || "androiddebugkey";
    envPropertiesContent["QIN_KEY_PASSWORD"] =
      envPropertiesContent["QIN_KEY_PASSWORD"] || "android";

    // Align Expo-style env keys with the placeholders Gradle expects.
    envPropertiesContent["WECHAT_ID"] =
      envPropertiesContent["WECHAT_ID"] ||
      envPropertiesContent["WECHAT_APP_ID"] ||
      "";
    envPropertiesContent["APP_LAUNCHER"] =
      envPropertiesContent["APP_LAUNCHER"] || "@mipmap/ic_launcher_hook";
    envPropertiesContent["APP_LAUNCHER_ROUND"] =
      envPropertiesContent["APP_LAUNCHER_ROUND"] || "@mipmap/ic_launcher_round_hook";
    envPropertiesContent["SPLASH_THEME"] =
      envPropertiesContent["SPLASH_THEME"] || "Theme.Hook.SplashScreen";

    // Default optional vendor keys to empty strings so manifest placeholders
    // and buildConfigField resolution don't fail during integration.
    [
      "JPUSH_VIVO_APPKEY",
      "JPUSH_VIVO_APPID",
      "JPUSH_HONOR_APPID",
      "JPUSH_OPPO_APPKEY",
      "JPUSH_OPPO_APPID",
      "JPUSH_OPPO_APPSECRET",
      "JPUSH_XIAOMI_APPKEY",
      "JPUSH_XIAOMI_APPID",
      "ALIYUN_APP_KEY_ANDROID",
      "ALIYUN_APP_SECRET_ANDROID",
      "ALIYUN_RSA_SECRET_ANDROID",
    ].forEach((key) => {
      envPropertiesContent[key] = envPropertiesContent[key] || "";
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
