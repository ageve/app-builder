import { setTaskName } from "../utils/common";
import { renameSync } from "fs-extra";
import { resolve } from "node:path";
import { cwd } from "node:process";
export default async function renameLog(context: any) {
  // 检查文件夹是否存在，否创建
  try {
    const { logFile, projectName, prepareEnv, variables, cwd } = context;
    const { commitId } = variables;
    const { versionName, PACKAGE_ID } = prepareEnv;
    const filename = resolve(
      cwd,
      `./build/${projectName}/${PACKAGE_ID}-${versionName}_${commitId}.log`
    );

    console.log(logFile, filename);

    renameSync(logFile, filename);
    return true;
  } catch (error) {
    console.log("rename log error", error);
  }
  return false;
}
setTaskName("renameLog", renameLog);
