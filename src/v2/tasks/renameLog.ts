import { renameSync } from "fs-extra";
import { resolve } from "node:path";
import { setTaskName } from "../utils/common";
export default async function renameLog(context: any) {
  // 检查文件夹是否存在，否创建
  try {
    const { logFile, projectName, prepareEnv, variables, env, cwd } = context;
    const { commitId } = variables;
    const { applicationId } = prepareEnv;
    const filename = resolve(
      cwd,
      `./build/${projectName}/${applicationId}.${env}.${commitId}.log`
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
