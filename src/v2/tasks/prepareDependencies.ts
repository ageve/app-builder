import { $, cd } from "zx";
import { setTaskName } from "../utils/common";
import { existsSync } from "node:fs";

export default async function prepareDependencies(context: any) {
  const { workspace } = context;
  try {
    cd(workspace);
    await $`pwd`;
    let packageManager = "npm";
    if (existsSync("yarn.lock")) {
      packageManager = "yarn";
    }
    if (existsSync("pnpm-lock.yaml")) {
      packageManager = "pnpm";
    }
    await $`${packageManager} install`;
    return true;
  } catch (error) {
    console.log("依赖下载失败", error);
  }
  return false;
}

setTaskName("prepareDependencies", prepareDependencies);
