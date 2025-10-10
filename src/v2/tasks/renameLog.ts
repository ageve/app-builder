import { log } from "@clack/prompts";
import dayjs from "dayjs";
import { copyFileSync, ensureDirSync } from "fs-extra";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { setTaskName } from "../utils/common";
async function renameLog(context: any, external = "") {
  // 检查文件夹是否存在，否创建
  try {
    const { logFile, projectName, prepareEnv, variables, env, cwd } = context;
    const { commitId } = variables;
    const { applicationId, packageAlias } = prepareEnv;
    // const friendlyFile = resolve(
    //   cwd,
    //   `./build/${projectName}/${applicationId}.${env}.${commitId}.log`
    // );

    const logoInfo = [packageAlias, env, external, commitId]
      .filter((it) => it)
      .join("_");

    log.info(`${logFile} ${logoInfo}`);

    ensureDirSync(resolve(cwd, `./logs/${projectName}`));

    if (existsSync(logFile)) {
      copyFileSync(
        logFile,
        resolve(
          cwd,
          `./logs/${projectName}/${logoInfo}.${dayjs().format(
            "MM-DD HH:mm"
          )}.log`
        )
      );
    }

    return true;
  } catch (error) {
    console.log("rename log error", error);
  }
  return false;
}

export default function createRenameLog({ external }: { external?: string }) {
  const task = (context: any) => renameLog(context, external);
  setTaskName("renameLog", task);
  return task;
}
