import { log } from "@clack/prompts";
import dayjs from "dayjs";
import { copyFileSync, ensureDirSync } from "fs-extra";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { setTaskName } from "../utils/common";
async function renameLog(context: any, _external = "") {
  // 检查文件夹是否存在，否创建
  try {
    const { logFile, projectName, cwd, buildId, logger } = context;
    const logoInfo = [buildId].filter((it) => it).join("_");

    log.info(`${logFile} ${logoInfo}`);

    ensureDirSync(resolve(cwd, `./logs/${projectName}`));

    await flushLogger(logger);
    const ready = await waitForFile(logFile, 10, 100);
    if (!ready) {
      log.warning(`skip renameLog: log file not ready -> ${logFile}`);
      return true;
    }

    const archivedLogFile = resolve(
      cwd,
      `./logs/${projectName}/${logoInfo}.${dayjs().format("MMDDHHmm")}.log`
    );
    log.info(`${logFile} => ${archivedLogFile}`);
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

async function flushLogger(logger: any) {
  if (!logger || typeof logger.end !== "function") {
    return;
  }

  if (logger.writableEnded || logger._ending) {
    return;
  }

  await new Promise<void>((resolvePromise) => {
    let done = false;
    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      resolvePromise();
    };

    try {
      logger.once?.("finish", finish);
      logger.end();
      setTimeout(finish, 1200);
    } catch (_error) {
      finish();
    }
  });
}

async function waitForFile(filePath: string, retries = 3, delayMs = 80) {
  for (let i = 0; i <= retries; i += 1) {
    if (existsSync(filePath)) {
      return true;
    }
    if (i < retries) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
    }
  }
  return false;
}
