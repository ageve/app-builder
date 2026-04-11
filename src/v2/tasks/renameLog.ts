import { log } from "@clack/prompts";
import dayjs from "dayjs";
import { copyFileSync, ensureDirSync } from "fs-extra";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { setTaskName } from "../utils/common";
async function renameLog(context: any, _external = "") {
  // 检查文件夹是否存在，否创建
  try {
    const { logFile, projectName, cwd, buildId } = context;
    const logoInfo = [buildId].filter((it) => it).join("_");

    log.info(`${logFile} ${logoInfo}`);

    ensureDirSync(resolve(cwd, `./logs/${projectName}`));

    if (!existsSync(logFile)) {
      return true;
    }

    const archivedLogFile = resolve(
      cwd,
      `./logs/${projectName}/${logoInfo}.${dayjs().format("MMDDHHmm")}.log`
    );
    copyFileSync(logFile, archivedLogFile);
    context.logFile = archivedLogFile;
    context.archivedLogFile = archivedLogFile;

    return {
      archivedLogFile,
      sourceLogFile: logFile,
    };
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
