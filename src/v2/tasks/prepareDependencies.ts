import { existsSync } from "node:fs";
import { $, cd } from "zx";

export default async function prepareDependencies(context: any) {
  const { workspace } = context;
  try {
    cd(workspace);
    await $`pwd`;
    let packageManager = "npm";
    if (existsSync("bun.lock")) {
      packageManager = "bun";
    } else if (existsSync("pnpm-lock.yaml")) {
      packageManager = "pnpm";
    } else if (existsSync("yarn.lock")) {
      packageManager = "yarn";
    }
    await $`${packageManager} install`;
    return true;
  } catch (error) {
    console.log("依赖下载失败", error);
  }
  return false;
}
