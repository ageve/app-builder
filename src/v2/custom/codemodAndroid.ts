import { log } from "@clack/prompts";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { setTaskName } from "../utils/common";

export async function codemodAndroid(context: any) {
  try {
    const { prepareEnv, workspace } = context;
    const { applicationId } = prepareEnv;

    const buildGradlePath = resolve(workspace, "./android/app/build.gradle");
    let content = readFileSync(buildGradlePath, "utf-8");

    // 替换 applicationId（可能在 android.defaultConfig 里）
    content = content.replace(
      /applicationId\s+['"](.*)['"]/,
      `applicationId "${applicationId}"`
    );

    writeFileSync(buildGradlePath, content, "utf-8");

    log.info("✅ sync ApplicationId success!");
    return true;
  } catch (error) {
    if (error instanceof Error) {
      log.error("sync ApplicationId failed " + error.message);
    }
  }
  return false;
}

setTaskName("codemodAndroid", codemodAndroid);
