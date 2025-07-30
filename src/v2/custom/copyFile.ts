import { log } from "@clack/prompts";
import fse from "fs-extra";
import { resolve } from "path";
import { setTaskName } from "../utils/common";
async function copyFile(
  context: any,
  files: { file: string; target: string }[]
) {
  try {
    const { prepareEnv, workspace } = context;

    for (const file of files) {
      const targetPath = resolve(workspace, file.target);
      fse.copyFileSync(file.file, targetPath);
      log.info(`✅ file ${file.file} copy to ${targetPath} success!`);
    }

    log.info("✅ all file copy success!");

    return true;
  } catch (error) {
    if (error instanceof Error) {
      log.error("copy file failed " + error.message);
    }
  }
  return false;
}

export default function createCopyFile(
  files: {
    file: string;
    target: string;
  }[]
) {
  const task = (context: any) => copyFile(context, files);
  setTaskName("copyFile", task);

  return task;
}
