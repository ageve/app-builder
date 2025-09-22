import dayjs from "dayjs";
import { copyFileSync, ensureDirSync, renameSync } from "fs-extra";
import { resolve } from "node:path";
import { setTaskName } from "../utils/common";
export default async function renameLog(context: any) {
  // 检查文件夹是否存在，否创建
  try {
    const { logFile, projectName, prepareEnv, variables, env, cwd } = context;
    const { commitId } = variables;
    const { applicationId } = prepareEnv;
    const friendlyFile = resolve(
      cwd,
      `./build/${projectName}/${applicationId}.${env}.${commitId}.log`
    );

    console.log(logFile, friendlyFile);

    renameSync(logFile, friendlyFile);
    ensureDirSync(`./logs/${projectName}`);
    copyFileSync(
      friendlyFile,
      `./logs/${projectName}/${dayjs().format(
        "MM-DDTHH:mm"
      )}.${applicationId}.${env}.${commitId}.log`
    );
    return true;
  } catch (error) {
    console.log("rename log error", error);
  }
  return false;
}
setTaskName("renameLog", renameLog);
