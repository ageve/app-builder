import { log } from "@clack/prompts";
import { copyFileSync } from "fs-extra";
import { basename } from "node:path";
import { setTaskName } from "../utils/common";
export default async function copyToFileBrowser(context: any) {
  try {
    const { buildAndroid } = context;
    const { productFile } = buildAndroid;
    const name = basename(productFile);
    copyFileSync(productFile, `/Volumes/Elements/切片/aiv-app-build/${name}`);
    log.success(
      `Copy complete, download url is: http://192.168.1.125/files/%E5%88%87%E7%89%87/aiv-app-build/${name}`
    );
    return true;
  } catch (error) {
    if (error instanceof Error) {
      log.info("Copy failed, " + error.message);
    }
  }
  return false;
}
setTaskName("copyToFileBrowser", copyToFileBrowser);
