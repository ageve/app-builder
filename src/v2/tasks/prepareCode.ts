import { $, cd } from "zx";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { setTaskName } from "../utils/common";
export default async function prepareCode(context: any) {
  const { workspace, branch, gitUri, logger } = context;
  try {
    cd(workspace);
    await $`pwd`;
    if (existsSync(resolve(workspace, "./.git"))) {
      await $`git checkout ${branch} `;
      await $`git fetch --all`;
      await $`git reset --hard origin/${branch}`;
      await $`git pull origin ${branch}`;      
    } else {
      await $`git clone ${gitUri} "."`;
      await $`git fetch --all`;
      await $`git checkout ${branch}`;
    }
    return true;
  } catch (error) {
    console.log("代码拉取失败", error);
  }
  return false;
}

setTaskName("prepareCode", prepareCode);
